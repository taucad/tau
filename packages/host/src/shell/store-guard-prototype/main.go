// gitguard: a research prototype, not product code. A FUSE passthrough of one git directory that refuses, by name,
// every operation that would create, replace, remove or modify the names through which git runs a program or follows
// another path. Everything else passes straight through to the real directory, so git inside and git outside share
// one store and one lock protocol.
//
// Usage: gitguard <real git directory> <mount point>   (prints "ready" once mounted)
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

// The protected names, relative to the git directory. A name protects itself and everything beneath it.
var protected = []string{"config", "hooks", "commondir", "config.worktree", "worktrees", "modules", "info/attributes", "objects/info/alternates", "objects/info/http-alternates"}

func isProtected(rel string) bool {
	for _, name := range protected {
		if rel == name || strings.HasPrefix(rel, name+"/") {
			return true
		}
		// An ancestor of a protected name may not be replaced or removed either.
		if strings.HasPrefix(name, rel+"/") {
			return true
		}
	}
	return false
}

type guardNode struct {
	fs.LoopbackNode
}

func (n *guardNode) rel(name string) string {
	return filepath.Join(n.Path(n.Root()), name)
}

// Writes to a protected name are refused; an ancestor directory of one stays usable, only not replaceable.
func (n *guardNode) writeRefused(name string) bool {
	rel := n.rel(name)
	for _, p := range protected {
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	return false
}

func (n *guardNode) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (*fs.Inode, fs.FileHandle, uint32, syscall.Errno) {
	if n.writeRefused(name) {
		return nil, nil, 0, syscall.EPERM
	}
	return n.LoopbackNode.Create(ctx, name, flags, mode, out)
}
func (n *guardNode) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if n.writeRefused(name) {
		return nil, syscall.EPERM
	}
	return n.LoopbackNode.Mkdir(ctx, name, mode, out)
}
func (n *guardNode) Mknod(ctx context.Context, name string, mode, rdev uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if n.writeRefused(name) {
		return nil, syscall.EPERM
	}
	return n.LoopbackNode.Mknod(ctx, name, mode, rdev, out)
}
func (n *guardNode) Symlink(ctx context.Context, target, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if n.writeRefused(name) {
		return nil, syscall.EPERM
	}
	return n.LoopbackNode.Symlink(ctx, target, name, out)
}
func (n *guardNode) Link(ctx context.Context, target fs.InodeEmbedder, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	// No new name for a protected file, and no protected name for any file.
	if n.writeRefused(name) || isProtected(target.EmbeddedInode().Path(n.Root())) {
		return nil, syscall.EPERM
	}
	return n.LoopbackNode.Link(ctx, target, name, out)
}
func (n *guardNode) Unlink(ctx context.Context, name string) syscall.Errno {
	if isProtected(n.rel(name)) {
		return syscall.EPERM
	}
	return n.LoopbackNode.Unlink(ctx, name)
}
func (n *guardNode) Rmdir(ctx context.Context, name string) syscall.Errno {
	if isProtected(n.rel(name)) {
		return syscall.EPERM
	}
	return n.LoopbackNode.Rmdir(ctx, name)
}
func (n *guardNode) Rename(ctx context.Context, name string, newParent fs.InodeEmbedder, newName string, flags uint32) syscall.Errno {
	to := filepath.Join(newParent.EmbeddedInode().Path(n.Root()), newName)
	if isProtected(n.rel(name)) || isProtected(to) {
		return syscall.EPERM
	}
	return n.LoopbackNode.Rename(ctx, name, newParent, newName, flags)
}
func (n *guardNode) Open(ctx context.Context, flags uint32) (fs.FileHandle, uint32, syscall.Errno) {
	if flags&(syscall.O_WRONLY|syscall.O_RDWR|syscall.O_TRUNC|syscall.O_APPEND) != 0 && n.writeRefused("") {
		return nil, 0, syscall.EPERM
	}
	return n.LoopbackNode.Open(ctx, flags)
}
func (n *guardNode) Setattr(ctx context.Context, f fs.FileHandle, in *fuse.SetAttrIn, out *fuse.AttrOut) syscall.Errno {
	if n.writeRefused("") {
		return syscall.EPERM
	}
	return n.LoopbackNode.Setattr(ctx, f, in, out)
}
func (n *guardNode) Setxattr(ctx context.Context, attr string, data []byte, flags uint32) syscall.Errno {
	if n.writeRefused("") {
		return syscall.EPERM
	}
	return n.LoopbackNode.Setxattr(ctx, attr, data, flags)
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: gitguard <real git directory> <mount point>")
		os.Exit(2)
	}
	var st syscall.Stat_t
	if err := syscall.Stat(os.Args[1], &st); err != nil {
		panic(err)
	}
	root := &fs.LoopbackRoot{Path: os.Args[1], Dev: uint64(st.Dev)}
	root.NewNode = func(rootData *fs.LoopbackRoot, parent *fs.Inode, name string, st *syscall.Stat_t) fs.InodeEmbedder {
		return &guardNode{LoopbackNode: fs.LoopbackNode{RootData: rootData}}
	}
	zero := time.Duration(0)
	// No caching of names or attributes: git outside changes the store under the mount at any time.
	opts := &fs.Options{EntryTimeout: &zero, AttrTimeout: &zero, NegativeTimeout: &zero}
	opts.MountOptions = fuse.MountOptions{DirectMount: true, DirectMountStrict: true, FsName: "gitguard", Name: "gitguard"}
	rootNode := &guardNode{LoopbackNode: fs.LoopbackNode{RootData: root}}
	root.RootNode = rootNode
	server, err := fs.Mount(os.Args[2], rootNode, opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, "mount:", err)
		os.Exit(1)
	}
	fmt.Println("ready")
	server.Wait()
}
