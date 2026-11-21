"""Streamlit entry point for the plate storage product site."""

from base64 import b64encode
from pathlib import Path

import streamlit as st
from streamlit.components.v1 import html as legacy_iframe

st.set_page_config(page_title="板材存放库 | Plate Storage System", layout="wide")
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
page = (assets / "index.html").read_text(encoding="utf-8")
styles = (assets / "style.css").read_text(encoding="utf-8")
page = page.replace('<link rel="stylesheet" href="./style.css">', f"<style>{styles}</style>")
for filename in ("depth.js", "scene.js", "app.js"):
    script = (assets / filename).read_text(encoding="utf-8")
    page = page.replace(f'<script src="./{filename}"></script>', f"<script>{script}</script>")
for image in (assets / "media").glob("*.webp"):
    encoded = b64encode(image.read_bytes()).decode("ascii")
    page = page.replace(f'src="./media/{image.name}"', f'src="data:image/webp;base64,{encoded}"')

if hasattr(st, "iframe"):
    st.iframe(page, height=840)
else:
    legacy_iframe(page, height=840, scrolling=True)
