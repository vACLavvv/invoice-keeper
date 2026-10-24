"""Verify a submission archive without extracting or executing its contents."""
import argparse
import hashlib
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


def verify(path):
    with ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("В архиве повторяются имена файлов")
        if archive.testzip() is not None:
            raise ValueError("Повреждён ZIP")
        for name in names:
            parts = PurePosixPath(name).parts
            if not parts or parts[0] != "invoice-keeper" or ".." in parts or "\\" in name:
                raise ValueError("Небезопасный путь в архиве")
            if any(p in (".git", ".venv", "data", "backups", "__pycache__") for p in parts) or PurePosixPath(name).name == ".env" or ".sqlite3" in name:
                raise ValueError("В архив попали рабочие данные")
        manifest_name = "invoice-keeper/CHECKSUMS.sha256"
        entries = {}
        for line in archive.read(manifest_name).decode().splitlines():
            digest, name = line.split("  ", 1)
            if name in entries:
                raise ValueError("Повтор в манифесте")
            entries[name] = digest
        actual = {name.removeprefix("invoice-keeper/") for name in names if name != manifest_name}
        if actual != set(entries):
            raise ValueError("Манифест не соответствует составу архива")
        for name, digest in entries.items():
            if hashlib.sha256(archive.read("invoice-keeper/" + name)).hexdigest() != digest:
                raise ValueError("Не совпадает SHA-256 исходного файла")
        return len(entries)


def main():
    parser = argparse.ArgumentParser(description="Проверить целостность архива для сдачи")
    parser.add_argument("path", nargs="?", type=Path, default=Path(__file__).resolve().parent.parent / "output/invoice-keeper.zip")
    args = parser.parse_args()
    count = verify(args.path)
    print(f"Архив проверен: {count} файлов, CRC/SHA-256 совпали, рабочих данных нет.")


if __name__ == "__main__":
    main()
