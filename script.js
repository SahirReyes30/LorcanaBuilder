const video = document.getElementById("camera");
const cameraSelect = document.getElementById("cameraSelect");
const btn = document.getElementById("capture");
const ocrText = document.getElementById("ocrText");
const cardResult = document.getElementById("cardResult");
const deckDiv = document.getElementById("deck");

// inicializar camara (preferir cámara trasera)
async function startCameraPreferRear(preferredDeviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  // intentos con diferentes constraints
  const attempts = [];
  // si viene un deviceId preferido, intentar con ese primero
  if (preferredDeviceId) attempts.push({ video: { deviceId: { exact: preferredDeviceId } } });
  attempts.push(
    { video: { facingMode: { exact: "environment" } } },
    { video: { facingMode: "environment" } },
    { video: true }
  );

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
      // si existe el selector, actualizar su valor para reflejar el device seleccionado
      if (cameraSelect) {
        cameraSelect.value = back.deviceId;
      }
    }
  } catch (e) {
    console.error("No se pudo acceder a la cámara trasera:", e);
  }
}

// poblar selector de cámaras y arrancar la cámara con la seleccionada
async function populateCameraSelect() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    startCameraPreferRear(); // fallback
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    if (cameraSelect) {
      cameraSelect.innerHTML = "";
      videoDevices.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Cámara ${i+1}`;
        cameraSelect.appendChild(opt);
      });
      // seleccionar por defecto una trasera si hay etiqueta que lo indique
      const back = videoDevices.find(d => /back|rear|environment/i.test(d.label));
      if (back) cameraSelect.value = back.deviceId;
      cameraSelect.addEventListener("change", () => {
        startCameraPreferRear(cameraSelect.value);
      });
      // iniciar con la seleccion actual
      if (cameraSelect.value) {
        startCameraPreferRear(cameraSelect.value);
        return;
      }
    }
    // fallback si no hay select o sin deviceId
    startCameraPreferRear();
  } catch (e) {
    console.error("Error enumerando dispositivos:", e);
    startCameraPreferRear();
  }
}
populateCameraSelect();

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

  const fullOcr = (text || "").trim();
  const nombre = fullOcr.split("\n")[0].trim(); // usar primera línea para la búsqueda
  ocrText.textContent = fullOcr || "(No se detectó texto)";

  if (!nombre) return;

  // buscar carta en Lorcana API
  const url = API_BASE + encodeURIComponent(nombre);

  try {
    // preparar headers de autenticación si existe api key
    const apiKey = getApiKey();
    const headers = apiKey ? { "Authorization": `Bearer ${apiKey}` } : {};
    const res = await fetch(url, { headers });

    // manejar autenticación requerida
    if (res.status === 401 || res.status === 403) {
      cardResult.innerHTML = `
        <div class="card-box">
          <p>Autenticación requerida para acceder a la API.</p>
          <button onclick="promptForApiKey()">Ingresar API key</button>
        </div>
      `;
      return;
    }
    if (!res.ok) throw new Error("Respuesta no OK: " + res.status);

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

         <!-- botón para mostrar la respuesta raw y contenedor -->
         <div style="margin-top:10px;">
           <button id="toggleRawBtn">Mostrar respuesta (raw)</button>
         </div>
         <pre id="apiResponse" class="api-response" style="display:none;"></pre>
       </div>
     `;

     // rellenar y activar toggle para mostrar la respuesta completa de la API
     (function attachRawToggle() {
       const pre = cardResult.querySelector("#apiResponse");
       const btn = cardResult.querySelector("#toggleRawBtn");
       if (!pre || !btn) return;
       pre.textContent = JSON.stringify(carta, null, 2);
       btn.addEventListener("click", () => {
         const isHidden = pre.style.display === "none";
         pre.style.display = isHidden ? "block" : "none";
         btn.textContent = isHidden ? "Ocultar respuesta (raw)" : "Mostrar respuesta (raw)";
       });
     })();

   } catch (e) {
    console.error(e);
    cardResult.textContent = "No se encontró la carta o hubo un error. Si la API requiere autenticación, ejecuta promptForApiKey() o window.setLorcanaApiKey(key) para guardar la key.";
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

// Config / helpers de autenticación para la API
const API_BASE = "https://lorcana-api.com/fuzzy/";
function getApiKey() {
  return localStorage.getItem("lorcanaApiKey") || null;
}
function setApiKey(key) {
  if (key) localStorage.setItem("lorcanaApiKey", key);
  else localStorage.removeItem("lorcanaApiKey");
}
// Exponer helpers mínimos para que el usuario pueda setear la key desde consola
window.setLorcanaApiKey = setApiKey;
window.promptForApiKey = () => {
  const k = prompt("Ingresa tu API key para la Lorcana API (vacío para quitarla):", getApiKey() || "");
  if (k !== null) {
    setApiKey(k.trim() || null);
    alert(k ? "API key guardada en localStorage" : "API key eliminada");
  }
}

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
    .api-response {
      text-align: left;
      background: #f7f7f7;
      padding: 8px;
      margin-top: 8px;
      max-height: 300px;
      overflow: auto;
      border-radius: 4px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 12px;
    }
    @media (min-width:800px) {
      .card-box { max-width:420px; }
    }
  `;
  document.head.appendChild(style);
}
injectCardStyles();
