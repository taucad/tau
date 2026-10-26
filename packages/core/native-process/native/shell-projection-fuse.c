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
  RENAME, UNLINK, RMDIR, READDIR, RELEASE, FLUSH, FSYNC, FORGET };
static const char *names[] = {"lookup","getattr","open","read","write","create","mkdir","setattr",
  "rename","unlink","rmdir","readdir","release","flush","fsync","forget"};
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
static napi_value number(napi_env env,double value) { napi_value result; napi_create_double(env,value,&result); return result; }
static napi_value integer(napi_env env,uint64_t value) { napi_value result; napi_create_bigint_uint64(env,value,&result); return result; }
static void property(napi_env env,napi_value object,const char *name,napi_value value) { napi_set_named_property(env,object,name,value); }
static void text_property(napi_env env,napi_value object,const char *name,const char *text) {
  if (!text) return;
  napi_value value; napi_create_string_utf8(env,text,NAPI_AUTO_LENGTH,&value); property(env,object,name,value);
}
static void fail_mount(struct mount_state *mount);
static void call_javascript(napi_env env,napi_value callback,void *context,void *data) {
  (void)context;
  struct message *message=data;
  if (!env || !callback || message->mount->closing) { free_message(message); return; }
  napi_value input,global,result;
  napi_create_object(env,&input);
  property(env,input,"id",number(env,(double)message->id));
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
    if (pending) {
      if(pending->operation==FORGET || pending->operation==RELEASE) fail_mount(message->mount);
      failure(pending->request,pending->operation,EIO); free(pending); }
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
  if (operation==FORGET || operation==RELEASE) fail_mount(mount);
  failure(request,operation,error);
}
static void report_failure(napi_env env,napi_value callback,void *context,void *data) {
  (void)context;(void)data;
  if (!env || !callback) return;
  napi_value global,result;
  napi_get_global(env,&global);
  if(napi_call_function(env,global,callback,0,NULL,&result)!=napi_ok)
    napi_fatal_error("shell-projection",NAPI_AUTO_LENGTH,"Projection failure callback failed",NAPI_AUTO_LENGTH);
}
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
    .destination=destination,.offset=offset,.size=size,.mode=mode,.flags=flags,.attributes=attributes,.lookups=lookups};
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
  if (napi_call_threadsafe_function(mount->callback,message,napi_tsfn_nonblocking)!=napi_ok) {
    pending=take_pending(mount,message->id);
    if (pending) { rejected(request,operation,EBUSY,mount); free(pending); }
    free_message(message);
  }
}
static void lookup(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,LOOKUP,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void getattr(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,GETATTR,i,f,NULL,NULL,0,0,0,NULL,0,0,0,0); }
static void opened(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,OPEN,i,f,NULL,NULL,0,0,0,NULL,0,(unsigned)f->flags,0,0); }
static void read_bytes(fuse_req_t r,fuse_ino_t i,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,READ,i,f,NULL,NULL,0,o,n,NULL,0,0,0,0); }
static void write_bytes(fuse_req_t r,fuse_ino_t i,const char *b,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,WRITE,i,f,NULL,NULL,0,o,n,b,0,(unsigned)f->flags,0,0); }
static void created(fuse_req_t r,fuse_ino_t p,const char *n,mode_t m,struct fuse_file_info *f) { dispatch(r,CREATE,p,f,n,NULL,0,0,0,NULL,m,(unsigned)f->flags,0,0); }
static void directory(fuse_req_t r,fuse_ino_t p,const char *n,mode_t m) { dispatch(r,MKDIR,p,NULL,n,NULL,0,0,0,NULL,m,0,0,0); }
static void setattr(fuse_req_t r,fuse_ino_t i,struct stat *a,int mask,struct fuse_file_info *f) { dispatch(r,SETATTR,i,f,NULL,NULL,0,(mask&FUSE_SET_ATTR_SIZE)?a->st_size:0,0,NULL,(mask&FUSE_SET_ATTR_MODE)?a->st_mode:0,0,(unsigned)mask,0); }
static void renamed(fuse_req_t r,fuse_ino_t p,const char *n,fuse_ino_t q,const char *m,unsigned flags) { dispatch(r,RENAME,p,NULL,n,m,q,0,0,NULL,0,flags,0,0); }
static void removed(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,UNLINK,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void removed_directory(fuse_req_t r,fuse_ino_t p,const char *n) { dispatch(r,RMDIR,p,NULL,n,NULL,0,0,0,NULL,0,0,0,0); }
static void listing(fuse_req_t r,fuse_ino_t i,size_t n,off_t o,struct fuse_file_info *f) { dispatch(r,READDIR,i,f,NULL,NULL,0,o,n,NULL,0,0,0,0); }
static void released(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,RELEASE,i,f,NULL,NULL,0,0,0,NULL,0,0,0,0); }
static void flushed(fuse_req_t r,fuse_ino_t i,struct fuse_file_info *f) { dispatch(r,FLUSH,i,f,NULL,NULL,0,0,0,NULL,0,0,0,0); }
static void synced(fuse_req_t r,fuse_ino_t i,int data,struct fuse_file_info *f) { dispatch(r,FSYNC,i,f,NULL,NULL,0,0,0,NULL,0,(unsigned)data,0,0); }
static void forgotten(fuse_req_t r,fuse_ino_t i,uint64_t count) { dispatch(r,FORGET,i,NULL,NULL,NULL,0,0,0,NULL,0,0,0,count); }
static void initialized(void *data,struct fuse_conn_info *connection) {
  (void)data;
  connection->want &= ~(FUSE_CAP_ASYNC_READ|FUSE_CAP_WRITEBACK_CACHE|FUSE_CAP_ASYNC_DIO|FUSE_CAP_PARALLEL_DIROPS|FUSE_CAP_NO_OPEN_SUPPORT|FUSE_CAP_NO_OPENDIR_SUPPORT);
  connection->max_write=MAX_BYTES; connection->max_background=16; connection->congestion_threshold=12;
}
static const struct fuse_lowlevel_ops operations={.init=initialized,.lookup=lookup,.getattr=getattr,.open=opened,
  .read=read_bytes,.write=write_bytes,.create=created,.mkdir=directory,.setattr=setattr,.rename=renamed,
  .unlink=removed,.rmdir=removed_directory,.readdir=listing,.release=released,.flush=flushed,.fsync=synced,.forget=forgotten};

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
      links>UINT32_MAX || ((mode&S_IFMT)!=S_IFREG && (mode&S_IFMT)!=S_IFDIR)) return false;
  memset(entry,0,sizeof(*entry)); entry->ino=ino;entry->generation=1;
  entry->attr.st_ino=ino;entry->attr.st_mode=(mode&S_IFMT)|(mode&0777);entry->attr.st_size=(off_t)size;
  entry->attr.st_nlink=links;entry->attr.st_uid=getuid();entry->attr.st_gid=getgid();
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
  if (pending->operation==FORGET) fuse_reply_none(pending->request);
  else if (has_error) { if(!get_number(env,args[2],"error",&error) || error>4095)error=EIO;fuse_reply_err(pending->request,(int)error); }
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
             napi_get_value_string_utf8(env,name,text,sizeof(text),&size)!=napi_ok || strchr(text,'/')) {valid=false;break;}
          struct stat stat={.st_ino=ino,.st_mode=(mode_t)mode};
          size_t needed=fuse_add_direntry(pending->request,buffer+used,pending->size-used,text,&stat,pending->offset+i+1);
          if(needed>pending->size-used)break;used+=needed;
        }
        if(valid)fuse_reply_buf(pending->request,buffer,used);else fuse_reply_err(pending->request,EIO);
        free(buffer);break;
      }
      default:fuse_reply_err(pending->request,0);break;
    }
  }
  free(pending);return result;
}

static void *loop(void *data) { struct mount_state *mount=data;fuse_session_loop(mount->session);fail_mount(mount);return NULL; }
static void stop(struct mount_state *mount) {
  pthread_mutex_lock(&mount->mutex);
  if(mount->closing){pthread_mutex_unlock(&mount->mutex);return;}
  mount->closing=true;
  struct pending *pending=mount->pending;mount->pending=NULL;mount->count=0;
  pthread_mutex_unlock(&mount->mutex);
  while(pending){struct pending *next=pending->next;failure(pending->request,pending->operation,EIO);free(pending);pending=next;}
  if(mount->session) {
    fuse_session_exit(mount->session);fuse_session_unmount(mount->session);
    if(mount->started)pthread_join(mount->thread,NULL);
    fuse_session_destroy(mount->session);mount->session=NULL;
  }
  if(mount->callback)napi_release_threadsafe_function(mount->callback,napi_tsfn_abort);
  if(mount->failure_callback)napi_release_threadsafe_function(mount->failure_callback,napi_tsfn_abort);
}
static void cleanup(void *data) {stop(data);}
static void finalized(napi_env env,void *data,void *hint) {(void)env;(void)hint;struct mount_state *mount=data;pthread_mutex_destroy(&mount->mutex);free(mount);}
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
  pthread_mutex_init(&mount->mutex,NULL);mount->env=env;
  napi_create_object(env,&object);napi_type_tag_object(env,object,&mount_tag);napi_wrap(env,object,mount,finalized,NULL,NULL);
  napi_create_reference(env,object,1,&mount->owner);napi_create_string_utf8(env,"Tau shell projection",NAPI_AUTO_LENGTH,&label);
  if(napi_create_threadsafe_function(env,values[1],NULL,label,MAX_PENDING,1,mount,callback_finished,NULL,call_javascript,&mount->callback)!=napi_ok) {
    mount->closing=true;napi_delete_reference(env,mount->owner);napi_throw_error(env,NULL,"Projection callback setup failed.");return NULL;
  }
  mount->callbacks=1;
  if(napi_create_threadsafe_function(env,values[2],NULL,label,1,1,mount,callback_finished,NULL,report_failure,&mount->failure_callback)!=napi_ok) {
    stop(mount);napi_throw_error(env,NULL,"Projection failure channel setup failed.");return NULL;
  }
  mount->callbacks++;
  char *arguments[]={"tau-shell-projection","-o","default_permissions,nosuid,nodev"};
  struct fuse_args args=FUSE_ARGS_INIT(3,arguments);
  mount->session=fuse_session_new(&args,&operations,sizeof(operations),mount);fuse_opt_free_args(&args);
  if(!mount->session || fuse_session_mount(mount->session,path)!=0) {
    stop(mount);napi_throw_error(env,NULL,"Projection mount unavailable.");return NULL;
  }
  if(pthread_create(&mount->thread,NULL,loop,mount)!=0){stop(mount);napi_throw_error(env,NULL,"Projection loop unavailable.");return NULL;}
  mount->started=true;napi_add_env_cleanup_hook(env,cleanup,mount);return object;
}
static napi_value library_identity(napi_env env,napi_callback_info info) {
  (void)info;
  Dl_info expected,actual;
  if(!dladdr((void *)fuse_session_new_versioned,&expected)) {
    napi_throw_error(env,NULL,"Cannot resolve projection library.");return NULL;
  }
  const void *symbols[]={(void *)fuse_add_direntry,(void *)fuse_opt_free_args,(void *)fuse_reply_attr,(void *)fuse_reply_buf,(void *)fuse_reply_create,(void *)fuse_reply_entry,(void *)fuse_reply_err,(void *)fuse_reply_none,(void *)fuse_reply_open,(void *)fuse_reply_write,(void *)fuse_req_userdata,(void *)fuse_session_destroy,(void *)fuse_session_exit,(void *)fuse_session_loop,(void *)fuse_session_mount,(void *)fuse_session_new_versioned,(void *)fuse_session_unmount,(void *)fuse_pkgversion};
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
