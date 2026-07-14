import os
import shutil
import gzip

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(BASE_DIR, "build")
REPO_OUT_DIR = os.path.join(BASE_DIR, "sileo_repo")
DEBS_OUT_DIR = os.path.join(REPO_OUT_DIR, "debs")

DEB_FILENAME = "com.tuanhungdz.ioscontrol_1.7.4_iphoneos-arm64_rebuilt.deb"
DEB_SRC_PATH = os.path.join(BUILD_DIR, DEB_FILENAME)

def make_repo():
    if not os.path.exists(DEB_SRC_PATH):
        print(f"Error: Rebuilt deb not found at {DEB_SRC_PATH}")
        return

    # 1. Setup folders
    print(f"Setting up Sileo repo folder at: {REPO_OUT_DIR}")
    os.makedirs(REPO_OUT_DIR, exist_ok=True)
    if os.path.exists(DEBS_OUT_DIR):
        shutil.rmtree(DEBS_OUT_DIR)
    os.makedirs(DEBS_OUT_DIR, exist_ok=True)

    # 2. Copy DEB
    deb_dest_path = os.path.join(DEBS_OUT_DIR, DEB_FILENAME)
    print(f"Copying {DEB_FILENAME} to {deb_dest_path}...")
    shutil.copy2(DEB_SRC_PATH, deb_dest_path)

    # Get dynamic size of copied DEB
    deb_size = os.path.getsize(deb_dest_path)

    # Read control file dynamically
    control_path = os.path.join(BASE_DIR, "tweak_package", "DEBIAN", "control")
    control_metadata = {}
    if os.path.exists(control_path):
        print(f"Reading metadata from {control_path}...")
        with open(control_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if ":" in line:
                    k, v = line.split(":", 1)
                    control_metadata[k.strip()] = v.strip()

    pkg_id = control_metadata.get("Package", "com.tuanhungdz.ioscontrol")
    name = control_metadata.get("Name", "IOSControl")
    version = control_metadata.get("Version", "1.7.4")
    arch = control_metadata.get("Architecture", "iphoneos-arm64")
    desc = control_metadata.get("Description", "Custom iOS automation tweak")
    maintainer = control_metadata.get("Maintainer", "tuanhungdz")
    author = control_metadata.get("Author", "trieudz")
    section = control_metadata.get("Section", "Tweaks")
    depends = control_metadata.get("Depends", "mobilesubstrate, firmware (>= 15.0)")
    installed_size = control_metadata.get("Installed-Size", "24744")

    conflicts = control_metadata.get("Conflicts")
    replaces = control_metadata.get("Replaces")

    import hashlib
    import bz2

    # Calculate SHA256 for DEB
    sha256_hash = hashlib.sha256()
    with open(deb_dest_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    deb_sha256 = sha256_hash.hexdigest()

    # 3. Create Packages file
    packages_content = f"""Package: {pkg_id}
Name: {name}
Version: {version}
Architecture: {arch}
Description: {desc}
Maintainer: {maintainer}
Author: {author}
Section: {section}
Depends: {depends}
Filename: debs/{DEB_FILENAME}
Size: {deb_size}
Installed-Size: {installed_size}
SHA256: {deb_sha256}
"""
    if conflicts:
        packages_content += f"Conflicts: {conflicts}\n"
    if replaces:
        packages_content += f"Replaces: {replaces}\n"
        
    packages_path = os.path.join(REPO_OUT_DIR, "Packages")
    print(f"Generating {packages_path}...")
    with open(packages_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(packages_content)

    # 4. Create Packages.gz
    packages_gz_path = os.path.join(REPO_OUT_DIR, "Packages.gz")
    print(f"Generating {packages_gz_path}...")
    with open(packages_path, "rb") as f_in:
        with gzip.open(packages_gz_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

    # 4b. Create Packages.bz2
    packages_bz2_path = os.path.join(REPO_OUT_DIR, "Packages.bz2")
    print(f"Generating {packages_bz2_path}...")
    with open(packages_path, "rb") as f_in:
        with bz2.open(packages_bz2_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

    # Helper function to compute file digests
    def get_digests(filepath):
        with open(filepath, 'rb') as f:
            data = f.read()
        return hashlib.md5(data).hexdigest(), hashlib.sha256(data).hexdigest(), len(data)

    p_md5, p_sha, p_size = get_digests(packages_path)
    pgz_md5, pgz_sha, pgz_size = get_digests(packages_gz_path)
    pbz_md5, pbz_sha, pbz_size = get_digests(packages_bz2_path)

    # 5. Create Release file
    release_content = f"""Origin: TuanHungDZ Repo
Label: TuanHungDZ
Suite: stable
Version: 1.0
Codename: ios
Architectures: {arch}
Components: main
Description: Personal Sileo repository for custom tweaks
MD5Sum:
 {p_md5} {p_size} Packages
 {pgz_md5} {gz_size if 'gz_size' in locals() else pgz_size} Packages.gz
 {pbz_md5} {pbz_size} Packages.bz2
SHA256:
 {p_sha} {p_size} Packages
 {pgz_sha} {pgz_size} Packages.gz
 {pbz_sha} {pbz_size} Packages.bz2
"""
    release_path = os.path.join(REPO_OUT_DIR, "Release")
    print(f"Generating {release_path}...")
    with open(release_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(release_content)

    print("\n[+] Sileo Repository structure created successfully!")
    print(f"Location: {REPO_OUT_DIR}")

    print("\nNext steps to publish on GitHub Pages:")
    print(f"1. Open command line and run:")
    print(f"   cd {REPO_OUT_DIR}")
    print(f"   git init")
    print(f"   git add .")
    print(f"   git commit -m 'Initial commit'")
    print(f"2. Create a new public repository on GitHub (e.g. 'sileo-repo')")
    print(f"3. Run:")
    print(f"   git remote add origin https://github.com/<your-username>/sileo-repo.git")
    print(f"   git branch -M main")
    print(f"   git push -u origin main")
    print(f"4. Go to GitHub -> Settings -> Pages, select 'Deploy from a branch' and set the source branch to 'main' (root folder).")

if __name__ == "__main__":
    make_repo()
