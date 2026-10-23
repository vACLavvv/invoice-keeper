"""Build a source-only handover archive using an allowlist."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
DIRECTORIES = ("app", "tests", "scripts", "docs")
FILES = ("README.md", ".env.example", ".gitignore", ".dockerignore", "requirements.txt", "requirements-dev.txt", "pyproject.toml", "Dockerfile", "compose.yaml")


def main():
    output = ROOT / "output/invoice-keeper.zip"
    output.parent.mkdir(exist_ok=True)
    paths = [ROOT / name for name in FILES]
    paths += [p for name in DIRECTORIES for p in (ROOT / name).rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix in (".py", ".html", ".css", ".js", ".svg", ".md", ".json", ".png", ".jpg")]
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            if path.is_symlink():
                raise RuntimeError(f"Символические ссылки не упаковываются: {path}")
            archive.write(path, "invoice-keeper/" + path.relative_to(ROOT).as_posix())
    print(f"Готово: {output}; файлов: {len(paths)}. .env, база, бэкапы и .venv исключены.")


if __name__ == "__main__":
    main()
