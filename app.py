"""Streamlit entry point for the storage systems product site."""

from base64 import b64encode
from html import escape
from pathlib import Path

import streamlit as st
from streamlit.components.v1 import html as legacy_iframe

product = "profiles" if st.query_params.get("product") == "profiles" else "plates"
patents = {
    "plates": {
        "name": "一种立体式板材存放架",
        "number": "ZL 2025 2 2002911.4",
        "announcement": "CN 224603803 U",
    },
    "profiles": {
        "name": "一种立体式型材存取库",
        "number": "ZL 2025 2 2002910.X",
        "announcement": "CN 224603802 U",
    },
}
page_title = "型材库 | Profile Storage System" if product == "profiles" else "板材存放库 | Plate Storage System"
st.set_page_config(page_title=page_title, layout="wide")
st.markdown(
    """
    <style>
      [data-testid="stAppViewContainer"], [data-testid="stApp"] { background: #1b2025; }
      [data-testid="stHeader"], footer { display: none; }
      .block-container { max-width: none !important; padding: 0 !important; }
      .block-container [data-testid="stVerticalBlock"] { gap: 0; }
      .block-container iframe { display: block; }
    </style>
    """,
    unsafe_allow_html=True,
)

assets = Path(__file__).resolve().parent / "component"
header = (assets / "header.html").read_text(encoding="utf-8")
active_link = f'data-product-link="{product}"'
st.markdown(header.replace(active_link, f'{active_link} aria-current="page"'), unsafe_allow_html=True)
page = (assets / "index.html").read_text(encoding="utf-8")
for field, value in patents[product].items():
    page = page.replace("{{patent_" + field + "}}", escape(value))
page = page.replace("{{product}}", product)
page = page.replace('<body data-product="plates">', f'<body data-product="{product}">')
page = page.replace("<title>板材存放库 | Plate Storage System</title>", f"<title>{page_title}</title>")
styles = (assets / "style.css").read_text(encoding="utf-8")
page = page.replace('<link rel="stylesheet" href="./style.css">', f"<style>{styles}</style>")
for filename in ("depth.js", "scene.js", "profiles.js", "app.js"):
    script = (assets / filename).read_text(encoding="utf-8")
    page = page.replace(f'<script src="./{filename}"></script>', f"<script>{script}</script>")
for image in (assets / "media").glob("*.webp"):
    source = f'src="./media/{image.name}"'
    if source not in page:
        continue
    encoded = b64encode(image.read_bytes()).decode("ascii")
    page = page.replace(source, f'src="data:image/webp;base64,{encoded}"')

if hasattr(st, "iframe"):
    st.iframe(page, height=840)
else:
    legacy_iframe(page, height=840, scrolling=True)
