"""Build an atomic, source-only release with a manifest and a local secret guard."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import os
import tempfile

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
DIRECTORIES = ("backend", "frontend", "tests", "scripts", "docs", "deploy")
FILES = ("Makefile", "README.md", ".env.example", ".gitignore", ".dockerignore", "pyproject.toml", "deploy/Dockerfile", "compose.yaml", "deploy/production.env.example")
SUFFIXES = {".py", ".html", ".css", ".js", ".svg", ".md", ".json", ".png", ".jpg", ".txt", ".woff2", ".yaml", ".yml", ".conf", ".service", ".timer", ".sh"}
SECRET_NAMES = ("ADMIN_PASSWORD", "DEMO_PASSWORD", "SMTP_PASSWORD", "TELEGRAM_BOT_TOKEN", "WEBHOOK_SECRET")


def build_archive(root):
    root = Path(root).resolve()
    output_directory = root / "output"
    if output_directory.is_symlink():
        raise RuntimeError("Каталог output не должен быть символической ссылкой")
    output_directory.mkdir(exist_ok=True)
    output = output_directory / "invoice-keeper.zip"
    paths = [root / name for name in FILES]
    paths += [p for name in DIRECTORIES for p in (root / name).rglob("*")
              if p.is_file() and "__pycache__" not in p.parts and p.suffix in SUFFIXES]
    local = dotenv_values(root / ".env")
    secrets = {value.encode() for key in SECRET_NAMES
               for value in (local.get(key), os.getenv(key)) if value and len(value) >= 8}
    manifest = []
    handle, temporary = tempfile.mkstemp(dir=output_directory, prefix=".release-", suffix=".zip")
    os.close(handle)
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
            for path in sorted(set(paths)):
                if path.is_symlink() or not path.resolve().is_relative_to(root):
                    raise RuntimeError("Ссылки за пределы проекта не упаковываются")
                payload = path.read_bytes()
                if any(secret in payload for secret in secrets):
                    raise RuntimeError("Обнаружен локальный секрет в исходниках; архив не изменён")
                name = path.relative_to(root).as_posix()
                manifest.append(hashlib.sha256(payload).hexdigest() + "  " + name)
                archive.writestr("invoice-keeper/" + name, payload)
            archive.writestr("invoice-keeper/CHECKSUMS.sha256", "\n".join(manifest) + "\n")
        os.replace(temporary, output)
    finally:
        Path(temporary).unlink(missing_ok=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    (output_directory / "invoice-keeper.zip.sha256").write_text(digest + "  invoice-keeper.zip\n")
    return output, len(manifest)


def main():
    output, count = build_archive(ROOT)
    print(f"Готово: {output}; исходных файлов: {count}. Секреты/БД исключены, контрольные суммы добавлены.")


if __name__ == "__main__":
    main()
