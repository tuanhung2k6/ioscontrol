import os
import io
import json
import time
import tarfile
import argparse

def build_ar_header(name, size):
    name_field = f"{name:<16}".encode('ascii')[:16]
    mtime_field = f"{int(time.time()):<12}".encode('ascii')[:12]
    uid_field = f"{0:<6}".encode('ascii')[:6]
    gid_field = f"{0:<6}".encode('ascii')[:6]
    mode_field = f"{0o100644:<8o}".encode('ascii')[:8]
    size_field = f"{size:<10}".encode('ascii')[:10]
    magic = b'\x60\x0a'
    return name_field + mtime_field + uid_field + gid_field + mode_field + size_field + magic

def find_metadata_entry(rel_path, metadata):
    for entry in metadata:
        if entry.get('name') == rel_path:
            return entry
    return None

def repack_deb(payload_dir, metadata, original_data_name, output_deb_path):
    print(f"Repacking {payload_dir} into {output_deb_path}...")
    
    # 1. Create control.tar.gz
    control_buf = io.BytesIO()
    debian_dir = os.path.join(payload_dir, "DEBIAN")
    
    with tarfile.open(fileobj=control_buf, mode='w:gz') as tar:
        # Add root directory entry "."
        ti_root = tarfile.TarInfo(name=".")
        ti_root.type = tarfile.DIRTYPE
        ti_root.mode = 0o755
        ti_root.uid = 501
        ti_root.gid = 20
        ti_root.uname = 'root'
        ti_root.gname = 'wheel'
        ti_root.mtime = int(time.time())
        tar.addfile(ti_root)
        
        if os.path.exists(debian_dir):
            for filename in sorted(os.listdir(debian_dir)):
                filepath = os.path.join(debian_dir, filename)
                if os.path.isdir(filepath):
                    continue
                    
                meta = find_metadata_entry(filename, metadata)
                with open(filepath, 'rb') as f:
                    file_data = f.read()
                    
                # Normalize line endings to Unix format (\n)
                if filename in ['control', 'postinst', 'preinst', 'postrm', 'prerm']:
                    file_data = file_data.replace(b'\r\n', b'\n')
                    
                ti = tarfile.TarInfo(name=f"./{filename}")
                ti.size = len(file_data)
                
                if meta:
                    ti.mode = meta.get('mode', 0o755 if filename in ['postinst', 'preinst', 'postrm', 'prerm'] else 0o644)
                    ti.uid = meta.get('uid', 0)
                    ti.gid = meta.get('gid', 0)
                    ti.uname = meta.get('uname', 'root')
                    ti.gname = meta.get('gname', 'wheel')
                    ti.mtime = meta.get('mtime', int(time.time()))
                else:
                    ti.mode = 0o755 if filename in ['postinst', 'preinst', 'postrm', 'prerm'] else 0o644
                    ti.uid = 0
                    ti.gid = 0
                    ti.uname = 'root'
                    ti.gname = 'wheel'
                    ti.mtime = int(time.time())
                tar.addfile(ti, io.BytesIO(file_data))
                
    control_bytes = control_buf.getvalue()
    
    # 2. Create data tarball
    data_buf = io.BytesIO()
    
    # Force data.tar.gz for maximum compatibility with all dpkg versions
    data_tar_name = 'data.tar.gz'
    data_mode = 'w:gz'
        
    print(f"  [-] Packing data to {data_tar_name} (mode {data_mode})...")
    
    # Build list of items
    rebuild_items = []
    for root, dirs, files in os.walk(payload_dir):
        if 'DEBIAN' in dirs:
            dirs.remove('DEBIAN')
        rel_root = os.path.relpath(root, payload_dir)
        if rel_root == '.':
            rel_root = ''
            
        for d in dirs:
            rel_path = os.path.join(rel_root, d).replace('\\', '/')
            rebuild_items.append((rel_path, 'dir'))
            
        for f in files:
            rel_path = os.path.join(rel_root, f).replace('\\', '/')
            if rel_path == 'debian-binary' or rel_path == 'metadata_permissions.json':
                continue
            if rel_path.endswith('.symlink'):
                orig_rel_path = rel_path[:-8]
                rebuild_items.append((orig_rel_path, 'symlink'))
            else:
                rebuild_items.append((rel_path, 'file'))
                
    rebuild_items.sort()
    
    with tarfile.open(fileobj=data_buf, mode=data_mode) as tar:
        # Add root directory entry "."
        ti_root = tarfile.TarInfo(name=".")
        ti_root.type = tarfile.DIRTYPE
        ti_root.mode = 0o755
        ti_root.uid = 501
        ti_root.gid = 20
        ti_root.uname = 'root'
        ti_root.gname = 'wheel'
        ti_root.mtime = int(time.time())
        tar.addfile(ti_root)
        
        for rel_path, item_type in rebuild_items:
            meta = find_metadata_entry(rel_path, metadata)
            ti = tarfile.TarInfo(name=rel_path)
            
            if meta:
                ti.mode = meta.get('mode')
                ti.uid = meta.get('uid', 0)
                ti.gid = meta.get('gid', 0)
                ti.uname = meta.get('uname', 'root')
                ti.gname = meta.get('gname', 'wheel')
                ti.mtime = meta.get('mtime', int(time.time()))
            else:
                if item_type == 'dir':
                    ti.mode = 0o755
                else:
                    if '/bin/' in rel_path or '/sbin/' in rel_path or rel_path.endswith('.sh') or rel_path.endswith('.lua'):
                        ti.mode = 0o755
                    else:
                        ti.mode = 0o644
                ti.uid = 0
                ti.gid = 0
                ti.uname = 'root'
                ti.gname = 'wheel'
                ti.mtime = int(time.time())
                
            if item_type == 'dir':
                ti.type = tarfile.DIRTYPE
                tar.addfile(ti)
            elif item_type == 'symlink':
                ti.type = tarfile.SYMTYPE
                if meta and meta.get('linkname'):
                    ti.linkname = meta['linkname']
                else:
                    symlink_file = os.path.join(payload_dir, rel_path + '.symlink')
                    if os.path.exists(symlink_file):
                        with open(symlink_file, 'r', encoding='utf-8') as f:
                            ti.linkname = f.read().strip()
                    else:
                        ti.linkname = ''
                tar.addfile(ti)
            elif item_type == 'file':
                ti.type = tarfile.REGTYPE
                filepath = os.path.join(payload_dir, rel_path)
                with open(filepath, 'rb') as f:
                    file_data = f.read()
                ti.size = len(file_data)
                tar.addfile(ti, io.BytesIO(file_data))
                
    data_bytes = data_buf.getvalue()
    
    # 3. Create debian-binary
    debian_binary = b"2.0\n"
    
    # 4. Write to deb
    os.makedirs(os.path.dirname(output_deb_path), exist_ok=True)
    with open(output_deb_path, 'wb') as deb_f:
        deb_f.write(b"!<arch>\n")
        deb_f.write(build_ar_header("debian-binary", len(debian_binary)))
        deb_f.write(debian_binary)
        if len(debian_binary) % 2 != 0:
            deb_f.write(b"\n")
        deb_f.write(build_ar_header("control.tar.gz", len(control_bytes)))
        deb_f.write(control_bytes)
        if len(control_bytes) % 2 != 0:
            deb_f.write(b"\n")
        deb_f.write(build_ar_header(data_tar_name, len(data_bytes)))
        deb_f.write(data_bytes)
        if len(data_bytes) % 2 != 0:
            deb_f.write(b"\n")
        
    print(f"  [+] Deb built successfully: {output_deb_path}")

def main():
    parser = argparse.ArgumentParser(description="Repack a Debian package directory on Windows.")
    parser.add_argument("dir", help="Path to the rebuilt package directory (e.g. rebuilt/com.trieudz.ioscontrol_1.7.4_iphoneos-arm64)")
    parser.add_argument("-o", "--output", help="Path to the output .deb file (optional)")
    args = parser.parse_args()

    payload_dir = os.path.abspath(args.dir)
    if not os.path.isdir(payload_dir):
        print(f"Error: Directory not found: {payload_dir}")
        return

    debian_dir = os.path.join(payload_dir, "DEBIAN")
    if not os.path.isdir(debian_dir):
        print(f"Error: Missing DEBIAN directory inside {payload_dir}")
        return

    metadata_path = os.path.join(payload_dir, "metadata_permissions.json")
    metadata = []
    if os.path.exists(metadata_path):
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        print(f"Loaded permission metadata from {metadata_path}")
    else:
        print("Warning: metadata_permissions.json not found. Repacking will use default permissions.")

    # Determine output path
    if args.output:
        output_deb = os.path.abspath(args.output)
    else:
        dir_name = os.path.basename(payload_dir)
        output_deb = os.path.join(os.path.dirname(payload_dir), f"{dir_name}_manual_rebuilt.deb")

    # Determine original compression from metadata or default to xz
    original_data_name = "data.tar.xz"
    for entry in metadata:
        if not entry.get('is_control'):
            # If the original metadata has a different naming pattern or if we know it was lzma/xz
            # In process_repo.py we save original_data_name. We can fall back to checking if there is any indicator,
            # or just default to data.tar.xz because it is xz. Let's make it data.tar.xz or data.tar.gz based on original.
            # In our case it was data.tar.lzma, which maps to .xz compression inside repack_deb.
            pass

    repack_deb(payload_dir, metadata, original_data_name, output_deb)

if __name__ == "__main__":
    main()
