import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PKG_ROOT = os.path.join(BASE_DIR, "tweak_package")

def patch_file(rel_path, target_bytes, replacement_bytes):
    fpath = os.path.join(PKG_ROOT, rel_path)
    if not os.path.exists(fpath):
        print(f"File not found: {rel_path}")
        return False
    
    with open(fpath, 'rb') as f:
        data = f.read()
    
    count = data.count(target_bytes)
    if count > 0:
        new_data = data.replace(target_bytes, replacement_bytes)
        with open(fpath, 'wb') as f:
            f.write(new_data)
        
        # Safe printing for binary / text
        try:
            t_str = target_bytes.decode('ascii')
            r_str = replacement_bytes.decode('ascii')
        except:
            t_str = target_bytes.hex()
            r_str = replacement_bytes.hex()
            
        print(f"Patched {rel_path}: replaced {count} occurrence(s) of '{t_str}' with '{r_str}'")
        return True
    else:
        try:
            t_str = target_bytes.decode('ascii')
        except:
            t_str = target_bytes.hex()
        print(f"No occurrences of '{t_str}' found in {rel_path}")
        return False

def patch_all():
    print("Starting port patch (9999 -> 9898)...")
    
    # 1. Patch iControlApp compiled binary strings
    app_bin_path = os.path.join("var", "jb", "Applications", "iControlApp.app", "iControlApp")
    patch_file(app_bin_path, b"9999", b"9898")
    
    # Patch license strings in native app to show Premium (must match exact string lengths)
    patch_file(app_bin_path, b"Free (2 min limit)", b"Premium (Lifetime)")
    patch_file(app_bin_path, b"Login / Buy Premium", b"TuanHungDZ Edition\x00")
    patch_file(app_bin_path, b"Activate License Key", b"Activated Lifetime \x00")

    # 2. Patch IOSControl.dylib binary instructions (MOVZ w2, #9999 -> MOVZ w2, #9898)
    dylib_path = os.path.join("var", "jb", "Library", "MobileSubstrate", "DynamicLibraries", "IOSControl.dylib")
    # b'\xe2\xe1\x84\x52' is MOVZ w2, #0x270f (9999)
    # b'\x42\xd5\x84\x52' is MOVZ w2, #0x26aa (9898)
    patch_file(dylib_path, b"\xe2\xe1\x84\x52", b"\x42\xd5\x84\x52")
    
    # Patch HTTPS verification domain to HTTP to bypass SSL validation
    patch_file(dylib_path, b"https://ioscontrol.com/version.json", b"http://ioscontrol.com/version.json\x00")

    # 3. Patch docs-data.js guide documentation
    docs_js_path = os.path.join("var", "jb", "usr", "local", "share", "ioscontrol", "static", "docs-data.js")
    patch_file(docs_js_path, b"9999", b"9898")

    # 4. Patch ioscontrol-usb.ps1 powershell script
    usb_ps1_path = os.path.join("var", "jb", "usr", "local", "share", "ioscontrol", "mac-tools", "ioscontrol-usb.ps1")
    patch_file(usb_ps1_path, b"9999", b"9898")
    patch_file(usb_ps1_path, b"9990", b"9890")

    print("Port patch completed.")

if __name__ == "__main__":
    patch_all()
