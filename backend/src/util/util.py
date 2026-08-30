from pathlib import Path

def read_api_key() -> str:
    key_path = Path(__file__).parents[3].joinpath("private/key.txt").resolve()
    with open(key_path, 'rt') as f:
        key = f.read()
    return key