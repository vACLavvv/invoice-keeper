import argparse

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Запустить Invoice Keeper. По умолчанию доступен только на этом компьютере.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18080)
    args = parser.parse_args()
    uvicorn.run("app.main:create_app", factory=True, host=args.host, port=args.port, workers=1, proxy_headers=False)


if __name__ == "__main__":
    main()
