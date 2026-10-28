import sys
from pdf2docx import Converter

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pdf_to_docx.py <input.pdf> <output.docx>", file=sys.stderr)
        return 2
    cv = Converter(sys.argv[1])
    try:
        cv.convert(sys.argv[2], start=0, end=None)
    finally:
        cv.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())