const video = document.getElementById("camera");
const btn = document.getElementById("capture");
const ocrText = document.getElementById("ocrText");
const cardResult = document.getElementById("cardResult");
const deckDiv = document.getElementById("deck");

// inicializar camara
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream);

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

  try {
    const res = await fetch(url);
    const carta = await res.json();

    cardResult.innerHTML = `
      <h3>${carta.name} ${carta.subtitle || ""}</h3>
      <img src="${carta.image_large}">
      <button onclick="addToDeck('${encodeURIComponent(JSON.stringify(carta))}')">
        ➕ Agregar al mazo
      </button>
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
