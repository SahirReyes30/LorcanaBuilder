const video = document.getElementById("camera");
const btn = document.getElementById("capture");
const ocrText = document.getElementById("ocrText");
const cardResult = document.getElementById("cardResult");
const deckDiv = document.getElementById("deck");

// inicializar camara (preferir cámara trasera)
async function startCameraPreferRear() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  // intentos con diferentes constraints
  const attempts = [
    { video: { facingMode: { exact: "environment" } } },
    { video: { facingMode: "environment" } },
    { video: true }
  ];

  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      return;
    } catch (e) {
      // seguir al siguiente intento
    }
  }

  // fallback: enumerar dispositivos y escoger una videoinput que parezca trasera
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    let back = videoDevices.find(d => /back|rear|environment/i.test(d.label));
    if (!back && videoDevices.length) back = videoDevices[0];
    if (back) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: back.deviceId } } });
      video.srcObject = stream;
    }
  } catch (e) {
    console.error("No se pudo acceder a la cámara trasera:", e);
  }
}

startCameraPreferRear();

// cargar mazo al iniciar
let deck = JSON.parse(localStorage.getItem("mazo")) || [];
renderDeck();


btn.addEventListener("click", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  // hacer OCR
  ocrText.textContent = "Leyendo texto...";
  const { data: { text } } = await Tesseract.recognize(canvas, "eng");

  const nombre = text.split("\n")[0].trim();
  ocrText.textContent = nombre || "(No se detectó nombre)";

  if (!nombre) return;

  // buscar carta en Lorcana API
  const url = "https://lorcana-api.com/fuzzy/" + encodeURIComponent(nombre);

  // inyectar estilos para centrar la carta (recuadro)
  function injectCardStyles() {
    if (document.getElementById("lorcana-card-styles")) return;
    const style = document.createElement("style");
    style.id = "lorcana-card-styles";
    style.textContent = `
      .card-box {
        max-width: 360px;
        margin: 16px auto;
        padding: 12px;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        text-align: center;
      }
      .card-box h3 { margin: 8px 0; font-size: 1.05rem; }
      .card-image-wrap { display:flex; justify-content:center; align-items:center; padding:6px 0; }
      .card-box img { max-width:100%; height:auto; display:block; border-radius:4px; }
      .card-box button { margin-top:8px; }
      @media (min-width:800px) {
        .card-box { max-width:420px; }
      }
    `;
    document.head.appendChild(style);
  }
  injectCardStyles();

  try {
    const res = await fetch(url);
    const carta = await res.json();

    cardResult.innerHTML = `
      <div class="card-box">
        <h3>${carta.name} ${carta.subtitle || ""}</h3>
        <div class="card-image-wrap">
          <img src="${carta.image_large}" alt="${carta.name}">
        </div>
        <button onclick="addToDeck('${encodeURIComponent(JSON.stringify(carta))}')">
          ➕ Agregar al mazo
        </button>
      </div>
    `;
  } catch (e) {
    cardResult.textContent = "No se encontró la carta.";
  }
});


// AGREGAR CARTA AL MAZO
window.addToDeck = (cartaEncoded) => {
  const carta = JSON.parse(decodeURIComponent(cartaEncoded));

  deck.push(carta);
  localStorage.setItem("mazo", JSON.stringify(deck));
  renderDeck();
};

// MOSTRAR MAZO
function renderDeck() {
  deckDiv.innerHTML = "";
  deck.forEach(carta => {
    deckDiv.innerHTML += `
      <div>
        <img src="${carta.image_small}">
        <p>${carta.name}</p>
      </div>
    `;
  });
}
