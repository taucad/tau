/* Tau's private Linux FUSE transport. Policy, inode state and storage stay in the trusted host.
 * libfuse is dynamically linked; this source does not embed its implementation.
 */
#define _GNU_SOURCE
#define FUSE_USE_VERSION 35
#define NAPI_VERSION 8
#include <node_api.h>
#include <fuse_lowlevel.h>
#include <errno.h>
#include <dlfcn.h>
#include <linux/fs.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define MAX_PENDING 128
#define MAX_BYTES (128 * 1024)
#define MAX_NAME 255
#define MAX_SAFE 9007199254740991ULL

enum operation { LOOKUP, GETATTR, OPEN, READ, WRITE, CREATE, MKDIR, SETATTR,
  RENAME, UNLINK, RMDIR, READDIR, RELEASE, FLUSH, FSYNC, FORGET, READLINK, INTERRUPT, LIFETIME };
static const char *names[] = {"lookup","getattr","open","read","write","create","mkdir","setattr",
  "rename","unlink","rmdir","readdir","release","flush","fsync","forget","readlink","interrupt","lifetime"};
/* Lifetime notifications never occupy a request slot. FORGET and RELEASE are answered natively, counted here and
 * delivered as one coalesced batch through a reserved queue slot, so a forget storm cannot exhaust the request
 * budget or fail the mount. */
struct forgotten_inode { uint64_t inode, count; };
struct released_handle { uint64_t inode, handle; };
struct lifetime {
  struct forgotten_inode *forgets; size_t forget_used, forget_capacity;
  struct released_handle *releases; size_t release_used, release_capacity;
};
struct pending { fuse_req_t request; uint64_t id; enum operation operation; size_t size; off_t offset; struct pending *next; };
struct mount_state {
  struct fuse_session *session;
  pthread_t thread;
  pthread_mutex_t mutex;
  struct pending *pending;
  unsigned count;
  uint64_t next_id;
  bool closing;
  bool started;
  napi_threadsafe_function callback;
  napi_threadsafe_function failure_callback;
  bool failed;
  /* Unreported lifetime notifications, and whether one batch message is already queued for them. */
  struct lifetime lifetime;
  bool lifetime_posted;
  /* Page-cache invalidations the owner asked for after a reply, sent by their own thread: the kernel may hold the
   * page locks of a write until a later request of the same write is answered, so the JS thread never sends one. */
  pthread_t invalidator;
  pthread_cond_t invalidations_ready;
  uint64_t *invalidations; size_t invalidation_used, invalidation_capacity;
  bool invalidator_started, invalidator_stopping;
  unsigned callbacks;
  napi_ref owner;
  napi_env env;
};
struct message {
  struct mount_state *mount;
  uint64_t id, inode, handle, destination, lookups;
  enum operation operation;
  off_t offset;
  size_t size;
  unsigned flags, mode, attributes;
  double modified;
  char *name, *other;
  unsigned char *data;
};
static const napi_type_tag mount_tag = {0xbda71a4117a54839ULL,0x89c66ab107925599ULL};

static void free_message(struct message *message) {
  if (!message) return;
  free(message->name); free(message->other); free(message->data); free(message);
}
static void failure(fuse_req_t request, enum operation operation, int error) {
  if (operation == FORGET) fuse_reply_none(request); else fuse_reply_err(request,error);
}
static struct pending *take_pending(struct mount_state *mount,uint64_t id) {
  pthread_mutex_lock(&mount->mutex);
  struct pending **cursor=&mount->pending;
  while (*cursor && (*cursor)->id != id) cursor=&(*cursor)->next;
  struct pending *result=*cursor;
  if (result) { *cursor=result->next; mount->count--; }
  pthread_mutex_unlock(&mount->mutex);
  return result;
}
static void free_lifetime(struct lifetime *lifetime) {
  free(lifetime->forgets); free(lifetime->releases); *lifetime=(struct lifetime){0};
}
/* Open addressing on the inode; inode 0 is never issued, so it marks an empty slot. Called with the mutex held. */
static bool count_forget(struct lifetime *lifetime,uint64_t inode,uint64_t count) {
  if (!inode || !count) return true;
  if ((lifetime->forget_used+1)*2>lifetime->forget_capacity) {
    size_t capacity=lifetime->forget_capacity?lifetime->forget_capacity*2:256;
    struct forgotten_inode *table=calloc(capacity,sizeof(*table));
    if (!table) return false;
    for (size_t i=0;i<lifetime->forget_capacity;i++) {
      struct forgotten_inode entry=lifetime->forgets[i];
      if (!entry.inode) continue;
      size_t slot=(size_t)(entry.inode*0x9e3779b97f4a7c15ULL)&(capacity-1);
      while (table[slot].inode) slot=(slot+1)&(capacity-1);
      table[slot]=entry;
    }
    free(lifetime->forgets); lifetime->forgets=table; lifetime->forget_capacity=capacity;
  }
  size_t slot=(size_t)(inode*0x9e3779b97f4a7c15ULL)&(lifetime->forget_capacity-1);
  while (lifetime->forgets[slot].inode && lifetime->forgets[slot].inode!=inode) slot=(slot+1)&(lifetime->forget_capacity-1);
  if (!lifetime->forgets[slot].inode) { lifetime->forgets[slot].inode=inode; lifetime->forget_used++; }
  /* The kernel's lookup counts are 64-bit; a sum that would wrap saturates and the owner reconciles it. */
  uint64_t total=lifetime->forgets[slot].count+count;
  lifetime->forgets[slot].count=total<count?UINT64_MAX:total;
  return true;
}
static bool count_release(struct lifetime *lifetime,uint64_t inode,uint64_t handle) {
  if (lifetime->release_used==lifetime->release_capacity) {
    size_t capacity=lifetime->release_capacity?lifetime->release_capacity*2:64;
    struct released_handle *grown=realloc(lifetime->releases,capacity*sizeof(*grown));
    if (!grown) return false;
    lifetime->releases=grown; lifetime->release_capacity=capacity;
  }
  lifetime->releases[lifetime->release_used++]=(struct released_handle){.inode=inode,.handle=handle};
  return true;
}
/* Queue one batch message when lifetime notifications are waiting and none is queued. Safe from either thread: it
 * never blocks, and a post that fails is retried on the next request, reply or notification. */
static void schedule_lifetime(struct mount_state *mount) {
  pthread_mutex_lock(&mount->mutex);
  bool post=!mount->closing && !mount->failed && !mount->lifetime_posted &&
    (mount->lifetime.forget_used || mount->lifetime.release_used);
  if (post) mount->lifetime_posted=true;
  pthread_mutex_unlock(&mount->mutex);
  if (!post) return;
  struct message *message=calloc(1,sizeof(*message));
  if (message) *message=(struct message){.mount=mount,.operation=LIFETIME};
  if (!message || napi_call_threadsafe_function(mount->callback,message,napi_tsfn_nonblocking)!=napi_ok) {
    free(message);
    pthread_mutex_lock(&mount->mutex); mount->lifetime_posted=false; pthread_mutex_unlock(&mount->mutex);
  }
}
static napi_value number(napi_env env,double value) { napi_value result; napi_create_double(env,value,&result); return result; }
static napi_value integer(napi_env env,uint64_t value) { napi_value result; napi_create_bigint_uint64(env,value,&result); return result; }
static void property(napi_env env,napi_value object,const char *name,napi_value value) { napi_set_named_property(env,object,name,value); }
static void text_property(napi_env env,napi_value object,const char *name,const char *text) {
  if (!text) return;
  napi_value value; napi_create_string_utf8(env,text,NAPI_AUTO_LENGTH,&value); property(env,object,name,value);
}
static void fail_mount(struct mount_state *mount);
static void queue_invalidation(struct mount_state *mount,uint64_t inode);
static void deliver_lifetime(napi_env env,napi_value callback,struct mount_state *mount) {
  pthread_mutex_lock(&mount->mutex);
  struct lifetime batch=mount->lifetime; mount->lifetime=(struct lifetime){0}; mount->lifetime_posted=false;
  pthread_mutex_unlock(&mount->mutex);
  napi_value input,forgets,releases,global,result;
  napi_create_object(env,&input);
  text_property(env,input,"operation",names[LIFETIME]);
  napi_create_array_with_length(env,batch.forget_used,&forgets);
  uint32_t index=0;
  for (size_t i=0;i<batch.forget_capacity;i++) {
    if (!batch.forgets[i].inode) continue;
    napi_value row; napi_create_object(env,&row);
    property(env,row,"inode",integer(env,batch.forgets[i].inode));
    property(env,row,"lookupCount",integer(env,batch.forgets[i].count));
    napi_set_element(env,forgets,index++,row);
  }
  napi_create_array_with_length(env,batch.release_used,&releases);
  for (size_t i=0;i<batch.release_used;i++) {
    napi_value row; napi_create_object(env,&row);
    property(env,row,"inode",integer(env,batch.releases[i].inode));
    property(env,row,"handle",integer(env,batch.releases[i].handle));
    napi_set_element(env,releases,(uint32_t)i,row);
  }
  free_lifetime(&batch);
  property(env,input,"forgets",forgets);
  property(env,input,"releases",releases);
  napi_get_global(env,&global);
  /* The kernel cannot resend these; a batch the wrapper cannot accept fails the mount instead of losing accounting. */
  if (napi_call_function(env,global,callback,1,&input,&result)!=napi_ok) {
    napi_value exception; napi_get_and_clear_last_exception(env,&exception); fail_mount(mount);
  }
}
static void call_javascript(napi_env env,napi_value callback,void *context,void *data) {
  (void)context;
  struct message *message=data;
  if (!env || !callback || message->mount->closing) { free_message(message); return; }
  if (message->operation==LIFETIME) {
    struct mount_state *mount=message->mount; free_message(message);
    deliver_lifetime(env,callback,mount); schedule_lifetime(mount); return;
  }
  napi_value input,global,result;
  napi_create_object(env,&input);
  property(env,input,"id",number(env,(double)message->id));
  if (message->operation==INTERRUPT) {
    text_property(env,input,"operation",names[INTERRUPT]);
    napi_value global,result;napi_get_global(env,&global);
    if (napi_call_function(env,global,callback,1,&input,&result)!=napi_ok) {napi_value exception;napi_get_and_clear_last_exception(env,&exception);}
    free_message(message);return;
  }
  text_property(env,input,"operation",names[message->operation]);
  property(env,input,"inode",integer(env,message->inode));
  property(env,input,"handle",integer(env,message->handle));
  property(env,input,"destinationParent",integer(env,message->destination));
  property(env,input,"lookupCount",integer(env,message->lookups));
  property(env,input,"offset",number(env,(double)message->offset));
  property(env,input,"length",number(env,(double)message->size));
  property(env,input,"flags",number(env,message->flags));
  property(env,input,"mode",number(env,message->mode));
  property(env,input,"attributes",number(env,message->attributes));
  if (message->operation==SETATTR) property(env,input,"modified",number(env,message->modified));
  text_property(env,input,"name",message->name);
  text_property(env,input,"destinationName",message->other);
  if (message->data) {
    napi_value bytes; napi_create_buffer_copy(env,message->size,message->data,NULL,&bytes);
    property(env,input,"data",bytes);
  }
  napi_get_global(env,&global);
  if (napi_call_function(env,global,callback,1,&input,&result) != napi_ok) {
    napi_value exception; napi_get_and_clear_last_exception(env,&exception);
    struct pending *pending=take_pending(message->mount,message->id);
    if (pending) { failure(pending->request,pending->operation,EIO); free(pending); }
  }
  free_message(message);
}
/* Lifetime notifications cannot be retried by the kernel. A reserved one-shot
 * channel reports their loss as fatal, never as successful owner accounting. */
static void fail_mount(struct mount_state *mount) {
  pthread_mutex_lock(&mount->mutex);
  bool notify=!mount->closing && !mount->failed;
  mount->failed=true;
  pthread_mutex_unlock(&mount->mutex);
  if (notify && napi_call_threadsafe_function(mount->failure_callback,NULL,napi_tsfn_blocking)!=napi_ok)
    napi_fatal_error("shell-projection",NAPI_AUTO_LENGTH,"Cannot report failed projection mount",NAPI_AUTO_LENGTH);
}
static void rejected(fuse_req_t request,enum operation operation,int error,struct mount_state *mount) {
  (void)mount; failure(request,operation,error);
}
static void report_failure(napi_env env,napi_value callback,void *context,void *data) {
  (void)context;(void)data;
  if (!env || !callback) return;
  napi_value global,result;
  napi_get_global(env,&global);
  if(napi_call_function(env,global,callback,0,NULL,&result)!=napi_ok)
    napi_fatal_error("shell-projection",NAPI_AUTO_LENGTH,"Projection failure callback failed",NAPI_AUTO_LENGTH);
}
/* Called with libfuse's request lock held: never reply here. The wrapper aborts that request's signal and its
 * handler answers, with EINTR when it committed nothing. */
static void interrupted(fuse_req_t request,void *data) {
  struct mount_state *mount=fuse_req_userdata(request);
  struct message *message=calloc(1,sizeof(*message));
  if (!message) return;
  *message=(struct message){.mount=mount,.operation=INTERRUPT,.id=(uint64_t)(uintptr_t)data};
  if (napi_call_threadsafe_function(mount->callback,message,napi_tsfn_nonblocking)!=napi_ok) free_message(message);
}
static double modified_at=0;
static void dispatch(fuse_req_t request,enum operation operation,fuse_ino_t inode,
  struct fuse_file_info *info,const char *name,const char *other,fuse_ino_t destination,
  off_t offset,size_t size,const char *data,unsigned mode,unsigned flags,unsigned attributes,uint64_t lookups) {
  struct mount_state *mount=fuse_req_userdata(request);
  if (size>MAX_BYTES || offset<0 || (uint64_t)offset>MAX_SAFE ||
      (name && strlen(name)>MAX_NAME) || (other && strlen(other)>MAX_NAME)) {
    rejected(request,operation,EOVERFLOW,mount); return;
  }
  struct pending *pending=calloc(1,sizeof(*pending));
  struct message *message=calloc(1,sizeof(*message));
  if (!pending || !message) { free(pending); free(message); rejected(request,operation,ENOMEM,mount); return; }
  *message=(struct message){.mount=mount,.operation=operation,.inode=inode,.handle=info?info->fh:0,
    .destination=destination,.offset=offset,.size=size,.mode=mode,.flags=flags,.attributes=attributes,.lookups=lookups,
    .modified=operation==SETATTR?modified_at:0};
  if (name) message->name=strdup(name);
  if (other) message->other=strdup(other);
  if (data && size) { message->data=malloc(size); if (message->data) memcpy(message->data,data,size); }
  if ((name && !message->name) || (other && !message->other) || (data && size && !message->data)) {
    free_message(message); free(pending); rejected(request,operation,ENOMEM,mount); return;
  }
  pthread_mutex_lock(&mount->mutex);
  if (mount->closing || mount->failed || mount->count>=MAX_PENDING || mount->next_id>=MAX_SAFE) {
    pthread_mutex_unlock(&mount->mutex); free_message(message); free(pending); rejected(request,operation,EBUSY,mount); return;
  }
  message->id=++mount->next_id;
  *pending=(struct pending){.request=request,.id=message->id,.operation=operation,.size=size,.offset=offset,.next=mount->pending};
  mount->pending=pending; mount->count++;
  pthread_mutex_unlock(&mount->mutex);
  uint64_t id=message->id;
  /* Register before delivery: once posted, the owner's reply may free the request. An interrupt that wins this race
   * reaches the wrapper before its request and is answered from the still-pending entry. */
  fuse_req_interrupt_func(request,interrupted,(void *)(uintptr_t)id);
  if (napi_call_threadsafe_function(mount->callback,message,napi_tsfn_nonblocking)!=napi_ok) {
    pending=take_pending(mount,id);
    if (pending) { rejected(request,operation,EBUSY,mount); free(pending); }
    free_message(message);
  }
  schedule_lifetime(mount);
}
static void lookup(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,LOOKUP,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void getattr(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,GETATTR,i,f,NULL,NULL,0,0,0,NULL,0,0,0,0); }
static void opened(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,OPEN,i,f,NULL,NULL,0,0,0,NULL,0,(unsigned)f->flags,0,0); }
static void read_bytes(fuse_req_t r,fuse_ino_t i,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,READ,i,f,NULL,NULL,0,o,n,NULL,0,0,0,0); }
static void write_bytes(fuse_req_t r,fuse_ino_t i,const char *b,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,WRITE,i,f,NULL,NULL,0,o,n,b,0,(unsigned)f->flags,0,0); }
static void created(fuse_req_t r,fuse_ino_t p,const char *n,mode_t m,struct fuse_file_info *f) { dispatch(r,CREATE,p,f,n,NULL,0,0,0,NULL,m,(unsigned)f->flags,0,0); }
static void directory(fuse_req_t r,fuse_ino_t p,const char *n,mode_t m) { dispatch(r,MKDIR,p,NULL,n,NULL,0,0,0,NULL,m,0,0,0); }
static void setattr(fuse_req_t r,fuse_ino_t i,struct stat *a,int mask,struct fuse_file_info *f) {
  /* The session loop is single-threaded, so this handoff into the copied message cannot race. */
  modified_at=(mask&FUSE_SET_ATTR_MTIME_NOW)?-1:(mask&FUSE_SET_ATTR_MTIME)?(double)a->st_mtim.tv_sec*1000+(double)a->st_mtim.tv_nsec/1e6:0;
  dispatch(r,SETATTR,i,f,NULL,NULL,0,(mask&FUSE_SET_ATTR_SIZE)?a->st_size:0,0,NULL,(mask&FUSE_SET_ATTR_MODE)?a->st_mode:0,0,(unsigned)mask,0); }
/* Only a plain rename and RENAME_NOREPLACE reach the owner. RENAME_EXCHANGE has no classified publication, so it is
 * refused here like whiteouts and unknown flags. */
static void renamed(fuse_req_t r,fuse_ino_t p,const char *n,fuse_ino_t q,const char *m,unsigned flags) {
  if (flags&~(unsigned)RENAME_NOREPLACE) {
    fuse_reply_err(r,EINVAL); return;
  }
  dispatch(r,RENAME,p,NULL,n,m,q,0,0,NULL,0,flags,0,0);
}
static void removed(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,UNLINK,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void removed_directory(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,RMDIR,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void listing(fuse_req_t r,fuse_ino_t i,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,READDIR,i,f,NULL,NULL,0,o,n,NULL,0,0,0,0); }
/* Lifetime notifications are recorded under the mutex and answered at once; losing one fails the mount. */
static void lifetime_counted(struct mount_state *mount,bool counted) {
  if (!counted) fail_mount(mount); else schedule_lifetime(mount);
}
static void released(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) {
  struct mount_state *mount=fuse_req_userdata(r);
  pthread_mutex_lock(&mount->mutex);
  bool counted=mount->closing || count_release(&mount->lifetime,i,f?f->fh:0);
  pthread_mutex_unlock(&mount->mutex);
  fuse_reply_err(r,0); lifetime_counted(mount,counted);
}
/* Writes are write-through and acknowledged synchronously, so close() has nothing to flush. Answering here keeps
 * a close-on-exec descriptor from blocking a child's exec on the owner's thread (the exec FLUSH deadlock). */
static void flushed(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { (void)i;(void)f;fuse_reply_err(r,0); }
static void read_link(fuse_req_t r,fuse_ino_t i) { dispatch(r,READLINK,i,NULL,NULL,NULL,0,0,0,NULL,0,0,0,0); }
/* No hard link or new symlink is ever created through the projection; the rooted authority has no such operation. */
static void linked(fuse_req_t r,fuse_ino_t i,fuse_ino_t p,const char *n) { (void)i;(void)p;(void)n;fuse_reply_err(r,EPERM); }
static void symlinked(fuse_req_t r,const char *t,fuse_ino_t p,const char *n) { (void)t;(void)p;(void)n;fuse_reply_err(r,EPERM); }
static void synced(fuse_req_t r,fuse_ino_t i,int data,struct fuse_file_info *f) { dispatch(r,FSYNC,i,f,NULL,NULL,0,0,0,NULL,0,(unsigned)data,0,0); }
static void forgotten(fuse_req_t r,fuse_ino_t i,uint64_t count) {
  struct mount_state *mount=fuse_req_userdata(r);
  pthread_mutex_lock(&mount->mutex);
  bool counted=mount->closing || count_forget(&mount->lifetime,i,count);
  pthread_mutex_unlock(&mount->mutex);
  fuse_reply_none(r); lifetime_counted(mount,counted);
}
static void forgotten_many(fuse_req_t r,size_t count,struct fuse_forget_data *forgets) {
  struct mount_state *mount=fuse_req_userdata(r);
  pthread_mutex_lock(&mount->mutex);
  bool counted=true;
  for (size_t i=0;!mount->closing && counted && i<count;i++) counted=count_forget(&mount->lifetime,forgets[i].ino,forgets[i].nlookup);
  pthread_mutex_unlock(&mount->mutex);
  fuse_reply_none(r); lifetime_counted(mount,counted);
}
static void initialized(void *data,struct fuse_conn_info *connection) {
  (void)data;
  connection->want &= ~(FUSE_CAP_ASYNC_READ|FUSE_CAP_WRITEBACK_CACHE|FUSE_CAP_ASYNC_DIO|FUSE_CAP_PARALLEL_DIROPS|FUSE_CAP_NO_OPEN_SUPPORT|FUSE_CAP_NO_OPENDIR_SUPPORT);
  connection->max_write=MAX_BYTES; connection->max_background=16; connection->congestion_threshold=12;
}
static const struct fuse_lowlevel_ops operations={.init=initialized,.lookup=lookup,.getattr=getattr,.open=opened,
  .read=read_bytes,.write=write_bytes,.create=created,.mkdir=directory,.setattr=setattr,.rename=renamed,
  .unlink=removed,.rmdir=removed_directory,.readdir=listing,.release=released,.flush=flushed,.fsync=synced,.forget=forgotten,.forget_multi=forgotten_many,
  .readlink=read_link,.link=linked,.symlink=symlinked};

static bool get_number(napi_env e,napi_value o,const char *key,uint64_t *out) {
  napi_value v; double value;
  if (napi_get_named_property(e,o,key,&v)!=napi_ok || napi_get_value_double(e,v,&value)!=napi_ok ||
      !(value>=0 && value<=MAX_SAFE) || value!=(double)(uint64_t)value) return false;
  *out=(uint64_t)value; return true;
}
static bool get_integer(napi_env e,napi_value o,const char *key,uint64_t *out) {
  napi_value v; bool lossless;
  return napi_get_named_property(e,o,key,&v)==napi_ok && napi_get_value_bigint_uint64(e,v,out,&lossless)==napi_ok && lossless;
}
static bool stat_reply(napi_env e,napi_value o,struct fuse_entry_param *entry) {
  napi_value value; uint64_t mode,size,links,ino;
  if (napi_get_named_property(e,o,"entry",&value)!=napi_ok || !get_integer(e,value,"inode",&ino) || !ino ||
      !get_number(e,value,"mode",&mode) || !get_number(e,value,"size",&size) || !get_number(e,value,"links",&links) ||
      links>UINT32_MAX || ((mode&S_IFMT)!=S_IFREG && (mode&S_IFMT)!=S_IFDIR && (mode&S_IFMT)!=S_IFLNK)) return false;
  memset(entry,0,sizeof(*entry)); entry->ino=ino;entry->generation=1;
  entry->attr.st_ino=ino;entry->attr.st_mode=(mode&S_IFMT)|(mode&0777);entry->attr.st_size=(off_t)size;
  entry->attr.st_nlink=links;entry->attr.st_uid=getuid();entry->attr.st_gid=getgid();
  entry->attr.st_blksize=4096;entry->attr.st_blocks=(blkcnt_t)((size+511)/512);
  napi_value time;double milliseconds;bool has_time=false;
  napi_has_named_property(e,value,"modified",&has_time);
  if (has_time) {
    if (napi_get_named_property(e,value,"modified",&time)!=napi_ok || napi_get_value_double(e,time,&milliseconds)!=napi_ok ||
        !(milliseconds>=0 && milliseconds<=8.64e15)) return false;
    struct timespec stamp={.tv_sec=(time_t)(milliseconds/1000),.tv_nsec=(long)((milliseconds-(double)(time_t)(milliseconds/1000)*1000)*1e6)};
    entry->attr.st_mtim=stamp;entry->attr.st_ctim=stamp;entry->attr.st_atim=stamp;
  }
  /* Zero entry/attribute timeouts force a fresh lookup of incoming generations. */
  return true;
}
static struct mount_state *unwrap(napi_env env,napi_value value) {
  bool matches=false;void *result=NULL;
  if (napi_check_object_type_tag(env,value,&mount_tag,&matches)!=napi_ok || !matches || napi_unwrap(env,value,&result)!=napi_ok) {
    napi_throw_type_error(env,NULL,"Invalid shell projection mount.");return NULL;
  }
  return result;
}
static napi_value reply(napi_env env,napi_callback_info info) {
  size_t count=3;napi_value args[3],result;uint64_t id;
  napi_get_cb_info(env,info,&count,args,NULL,NULL);
  if (count!=3) { napi_throw_type_error(env,NULL,"Projection reply requires mount, id and result.");return NULL; }
  struct mount_state *mount=unwrap(env,args[0]);if (!mount)return NULL;
  double raw_id;if(napi_get_value_double(env,args[1],&raw_id)!=napi_ok || !(raw_id>=1 && raw_id<=MAX_SAFE) || raw_id!=(double)(uint64_t)raw_id) {
    napi_throw_type_error(env,NULL,"Invalid projection request id.");return NULL;
  }
  id=(uint64_t)raw_id;struct pending *pending=take_pending(mount,id);
  napi_get_boolean(env,pending!=NULL,&result);if(!pending)return result;
  uint64_t error=0;bool has_error=false;
  napi_has_named_property(env,args[2],"error",&has_error);
  /* An error reply names a real errno; zero is success only by omitting it, never a payload-free success. */
  if (has_error) { if(!get_number(env,args[2],"error",&error) || error==0 || error>4095)error=EIO;fuse_reply_err(pending->request,(int)error); }
  else {
    struct fuse_entry_param entry;uint64_t handle;
    struct fuse_file_info file={0};
    switch(pending->operation) {
      case LOOKUP:case MKDIR:case CREATE:case GETATTR:case SETATTR:
        if(!stat_reply(env,args[2],&entry))fuse_reply_err(pending->request,EIO);
        else if(pending->operation==CREATE) {
          if(!get_integer(env,args[2],"handle",&handle))fuse_reply_err(pending->request,EIO);
          else {file.fh=handle;fuse_reply_create(pending->request,&entry,&file);}
        } else if(pending->operation==GETATTR || pending->operation==SETATTR)fuse_reply_attr(pending->request,&entry.attr,0);
        else fuse_reply_entry(pending->request,&entry);
        break;
      case OPEN:
        if(!get_integer(env,args[2],"handle",&handle))fuse_reply_err(pending->request,EIO);
        else {file.fh=handle;fuse_reply_open(pending->request,&file);}break;
      case READ: {
        napi_value bytes,array; napi_typedarray_type type;size_t length,offset;void *data;
        if(napi_get_named_property(env,args[2],"bytes",&bytes)!=napi_ok || napi_get_typedarray_info(env,bytes,&type,&length,&data,&array,&offset)!=napi_ok ||
           type!=napi_uint8_array || length>pending->size)fuse_reply_err(pending->request,EIO);
        else fuse_reply_buf(pending->request,data,length);break;
      }
      case WRITE: {
        uint64_t written;if(!get_number(env,args[2],"written",&written) || written>pending->size)fuse_reply_err(pending->request,EIO);
        else fuse_reply_write(pending->request,(size_t)written);break;
      }
      case READDIR: {
        napi_value rows;uint32_t length=0;bool array=false;size_t used=0;bool valid=true;
        char *buffer=malloc(pending->size?pending->size:1);
        if(!buffer || napi_get_named_property(env,args[2],"entries",&rows)!=napi_ok || napi_is_array(env,rows,&array)!=napi_ok || !array ||
           napi_get_array_length(env,rows,&length)!=napi_ok || length>4096)valid=false;
        for(uint32_t i=0;valid && i<length;i++) {
          napi_value row,name;char text[MAX_NAME+1];size_t size;uint64_t ino,mode;
          if(napi_get_element(env,rows,i,&row)!=napi_ok || !get_integer(env,row,"inode",&ino) || !get_number(env,row,"mode",&mode) ||
             napi_get_named_property(env,row,"name",&name)!=napi_ok || napi_get_value_string_utf8(env,name,NULL,0,&size)!=napi_ok || size>MAX_NAME ||
             napi_get_value_string_utf8(env,name,text,sizeof(text),&size)!=napi_ok || strlen(text)!=size || size==0 ||
             strchr(text,'/') || !strcmp(text,".") || !strcmp(text,"..")) {valid=false;break;}
          /* A row's cookie is the offset the next readdir resumes from; it defaults to the row's position. */
          uint64_t cookie=(uint64_t)pending->offset+i+1;bool has_cookie=false;
          napi_has_named_property(env,row,"cookie",&has_cookie);
          if(has_cookie && (!get_number(env,row,"cookie",&cookie) || cookie==0 || cookie>INT64_MAX)) {valid=false;break;}
          struct stat stat={.st_ino=ino,.st_mode=(mode_t)mode};
          size_t needed=fuse_add_direntry(pending->request,buffer+used,pending->size-used,text,&stat,(off_t)cookie);
          if(needed>pending->size-used)break;used+=needed;
        }
        if(valid)fuse_reply_buf(pending->request,buffer,used);else fuse_reply_err(pending->request,EIO);
        free(buffer);break;
      }
      case READLINK: {
        napi_value target;size_t size;char text[4096];
        if(napi_get_named_property(env,args[2],"target",&target)!=napi_ok || napi_get_value_string_utf8(env,target,NULL,0,&size)!=napi_ok ||
           size==0 || size>=sizeof(text) || napi_get_value_string_utf8(env,target,text,sizeof(text),&size)!=napi_ok)fuse_reply_err(pending->request,EIO);
        else fuse_reply_readlink(pending->request,text);
        break;
      }
      default:fuse_reply_err(pending->request,0);break;
    }
  }
  /* Inodes whose cached pages may hold bytes the owner did not accept; they are dropped after this reply. */
  bool has_invalidate=false;napi_value list;uint32_t invalid_count=0;bool is_array=false;
  napi_has_named_property(env,args[2],"invalidate",&has_invalidate);
  if (has_invalidate && napi_get_named_property(env,args[2],"invalidate",&list)==napi_ok && napi_is_array(env,list,&is_array)==napi_ok &&
      is_array && napi_get_array_length(env,list,&invalid_count)==napi_ok && invalid_count<=64) {
    for (uint32_t i=0;i<invalid_count;i++) {
      napi_value item;uint64_t inode;bool lossless;
      if (napi_get_element(env,list,i,&item)==napi_ok && napi_get_value_bigint_uint64(env,item,&inode,&lossless)==napi_ok && lossless && inode)
        queue_invalidation(mount,inode);
      else fail_mount(mount);
    }
  } else if (has_invalidate) fail_mount(mount);
  free(pending);schedule_lifetime(mount);return result;
}

static void *invalidate_pages(void *data) {
  struct mount_state *mount=data;
  pthread_mutex_lock(&mount->mutex);
  for (;;) {
    while (!mount->invalidator_stopping && !mount->invalidation_used) pthread_cond_wait(&mount->invalidations_ready,&mount->mutex);
    if (mount->invalidator_stopping) break;
    uint64_t *batch=mount->invalidations; size_t count=mount->invalidation_used;
    mount->invalidations=NULL; mount->invalidation_used=0; mount->invalidation_capacity=0;
    pthread_mutex_unlock(&mount->mutex);
    /* ENOENT means the kernel holds no cache for that inode; nothing else is actionable after a reply. */
    for (size_t i=0;i<count;i++) fuse_lowlevel_notify_inval_inode(mount->session,(fuse_ino_t)batch[i],0,0);
    free(batch);
    pthread_mutex_lock(&mount->mutex);
  }
  pthread_mutex_unlock(&mount->mutex);
  return NULL;
}
/* Queue one inode's page cache for invalidation; a failed allocation fails the mount rather than serve stale pages. */
static void queue_invalidation(struct mount_state *mount,uint64_t inode) {
  pthread_mutex_lock(&mount->mutex);
  bool queued=mount->closing || !mount->invalidator_started;
  if (!queued) {
    if (mount->invalidation_used==mount->invalidation_capacity) {
      size_t capacity=mount->invalidation_capacity?mount->invalidation_capacity*2:16;
      uint64_t *grown=realloc(mount->invalidations,capacity*sizeof(*grown));
      if (grown) { mount->invalidations=grown; mount->invalidation_capacity=capacity; }
    }
    if (mount->invalidation_used<mount->invalidation_capacity) {
      mount->invalidations[mount->invalidation_used++]=inode; queued=true;
      pthread_cond_signal(&mount->invalidations_ready);
    }
  }
  pthread_mutex_unlock(&mount->mutex);
  if (!queued) fail_mount(mount);
}
static void *loop(void *data) { struct mount_state *mount=data;fuse_session_loop(mount->session);fail_mount(mount);return NULL; }
static void stop(struct mount_state *mount) {
  pthread_mutex_lock(&mount->mutex);
  if(mount->closing){pthread_mutex_unlock(&mount->mutex);return;}
  mount->closing=true;
  struct pending *pending=mount->pending;mount->pending=NULL;mount->count=0;
  mount->invalidator_stopping=true;pthread_cond_signal(&mount->invalidations_ready);
  pthread_mutex_unlock(&mount->mutex);
  while(pending){struct pending *next=pending->next;failure(pending->request,pending->operation,EIO);free(pending);pending=next;}
  if(mount->session) {
    fuse_session_exit(mount->session);fuse_session_unmount(mount->session);
    if(mount->started)pthread_join(mount->thread,NULL);
    /* Unmount aborted the connection, so a notification blocked in the kernel has returned. */
    if(mount->invalidator_started)pthread_join(mount->invalidator,NULL);
    fuse_session_destroy(mount->session);mount->session=NULL;
  }
  if(mount->callback)napi_release_threadsafe_function(mount->callback,napi_tsfn_abort);
  if(mount->failure_callback)napi_release_threadsafe_function(mount->failure_callback,napi_tsfn_abort);
  /* After the loop has joined nothing records more; the owner reconciles unreported references after unmount. */
  pthread_mutex_lock(&mount->mutex);free_lifetime(&mount->lifetime);
  free(mount->invalidations);mount->invalidations=NULL;mount->invalidation_used=mount->invalidation_capacity=0;
  pthread_mutex_unlock(&mount->mutex);
}
static void cleanup(void *data) {stop(data);}
static void finalized(napi_env env,void *data,void *hint) {(void)env;(void)hint;struct mount_state *mount=data;pthread_cond_destroy(&mount->invalidations_ready);pthread_mutex_destroy(&mount->mutex);free(mount);}
static void callback_finished(napi_env env,void *data,void *hint) {(void)hint;struct mount_state *mount=data;if(--mount->callbacks==0 && env && mount->owner)napi_delete_reference(env,mount->owner);}
static napi_value close_mount(napi_env env,napi_callback_info info) {
  size_t count=1;napi_value value,result;napi_get_cb_info(env,info,&count,&value,NULL,NULL);
  if(count!=1){napi_throw_type_error(env,NULL,"Projection close requires a mount.");return NULL;}
  struct mount_state *mount=unwrap(env,value);if(!mount)return NULL;
  if(!mount->closing){napi_remove_env_cleanup_hook(env,cleanup,mount);stop(mount);}
  napi_get_undefined(env,&result);return result;
}
static napi_value mount_projection(napi_env env,napi_callback_info info) {
  size_t count=3;napi_value values[3],object,label;napi_valuetype type;char path[4096];size_t length;
  napi_get_cb_info(env,info,&count,values,NULL,NULL);
  if(count!=3 || napi_get_value_string_utf8(env,values[0],NULL,0,&length)!=napi_ok || length>=sizeof(path) ||
     napi_get_value_string_utf8(env,values[0],path,sizeof(path),&length)!=napi_ok || path[0]!='/' ||
     napi_typeof(env,values[1],&type)!=napi_ok || type!=napi_function ||
     napi_typeof(env,values[2],&type)!=napi_ok || type!=napi_function) {
    napi_throw_type_error(env,NULL,"Projection mount requires an absolute mountpoint and callback.");return NULL;
  }
  struct mount_state *mount=calloc(1,sizeof(*mount));if(!mount){napi_throw_error(env,NULL,"Projection allocation failed.");return NULL;}
  pthread_mutex_init(&mount->mutex,NULL);pthread_cond_init(&mount->invalidations_ready,NULL);mount->env=env;
  napi_create_object(env,&object);napi_type_tag_object(env,object,&mount_tag);napi_wrap(env,object,mount,finalized,NULL,NULL);
  napi_create_reference(env,object,1,&mount->owner);napi_create_string_utf8(env,"Tau shell projection",NAPI_AUTO_LENGTH,&label);
  /* Queue: one message per pending request, at most one interrupt each, and one reserved lifetime batch. */
  if(napi_create_threadsafe_function(env,values[1],NULL,label,2*MAX_PENDING+1,1,mount,callback_finished,NULL,call_javascript,&mount->callback)!=napi_ok) {
    mount->closing=true;napi_delete_reference(env,mount->owner);napi_throw_error(env,NULL,"Projection callback setup failed.");return NULL;
  }
  mount->callbacks=1;
  if(napi_create_threadsafe_function(env,values[2],NULL,label,1,1,mount,callback_finished,NULL,report_failure,&mount->failure_callback)!=napi_ok) {
    stop(mount);napi_throw_error(env,NULL,"Projection failure channel setup failed.");return NULL;
  }
  mount->callbacks++;
  /* auto_unmount: fusermount3 removes the mount when this process dies, so a dead owner never leaves a stale mount. */
  char *arguments[]={"tau-shell-projection","-o","default_permissions,nosuid,nodev,auto_unmount"};
  struct fuse_args args=FUSE_ARGS_INIT(3,arguments);
  mount->session=fuse_session_new(&args,&operations,sizeof(operations),mount);fuse_opt_free_args(&args);
  if(!mount->session || fuse_session_mount(mount->session,path)!=0) {
    stop(mount);napi_throw_error(env,NULL,"Projection mount unavailable.");return NULL;
  }
  if(pthread_create(&mount->thread,NULL,loop,mount)!=0){stop(mount);napi_throw_error(env,NULL,"Projection loop unavailable.");return NULL;}
  mount->started=true;
  if(pthread_create(&mount->invalidator,NULL,invalidate_pages,mount)!=0){stop(mount);napi_throw_error(env,NULL,"Projection invalidation unavailable.");return NULL;}
  pthread_mutex_lock(&mount->mutex);mount->invalidator_started=true;pthread_mutex_unlock(&mount->mutex);
  napi_add_env_cleanup_hook(env,cleanup,mount);return object;
}
static napi_value library_identity(napi_env env,napi_callback_info info) {
  (void)info;
  Dl_info expected,actual;
  if(!dladdr((void *)fuse_session_new_versioned,&expected)) {
    napi_throw_error(env,NULL,"Cannot resolve projection library.");return NULL;
  }
  const void *symbols[]={(void *)fuse_add_direntry,(void *)fuse_lowlevel_notify_inval_inode,(void *)fuse_opt_free_args,(void *)fuse_reply_attr,(void *)fuse_reply_buf,(void *)fuse_reply_create,(void *)fuse_reply_entry,(void *)fuse_reply_err,(void *)fuse_reply_none,(void *)fuse_reply_open,(void *)fuse_reply_readlink,(void *)fuse_reply_write,(void *)fuse_req_interrupt_func,(void *)fuse_req_userdata,(void *)fuse_session_destroy,(void *)fuse_session_exit,(void *)fuse_session_loop,(void *)fuse_session_mount,(void *)fuse_session_new_versioned,(void *)fuse_session_unmount,(void *)fuse_pkgversion};
  for(size_t i=0;i<sizeof(symbols)/sizeof(symbols[0]);i++) {
    if(!dladdr(symbols[i],&actual) || actual.dli_fbase!=expected.dli_fbase) {
      napi_throw_error(env,NULL,"Projection library symbols resolve to different modules.");return NULL;
    }
  }
  napi_value result;
  napi_create_object(env,&result);
  text_property(env,result,"path",expected.dli_fname);
  text_property(env,result,"version",fuse_pkgversion());
  return result;
}
static napi_value initialize(napi_env env,napi_value exports) {
  napi_property_descriptor properties[]={
    {"libraryIdentity",NULL,library_identity,NULL,NULL,NULL,napi_default,NULL},
    {"mount",NULL,mount_projection,NULL,NULL,NULL,napi_default,NULL},
    {"reply",NULL,reply,NULL,NULL,NULL,napi_default,NULL},
    {"close",NULL,close_mount,NULL,NULL,NULL,napi_default,NULL}};
  napi_define_properties(env,exports,4,properties);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,initialize)
