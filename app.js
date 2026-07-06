(function () {
  const GRANDPA_NAME = "Dziadek";
  const VIEWER_NAME = "Viewer";
  const MIROTALK_JOIN_URL = "https://p2p.mirotalk.com/join";
  const VIEWER_COUNT = 4;

  const gate = document.getElementById("gate");
  const call = document.getElementById("call");
  const adminPanel = document.getElementById("adminPanel");
  const generateButton = document.getElementById("generateButton");
  const installButton = document.getElementById("installButton");
  const joinInstallButton = document.getElementById("joinInstallButton");
  const adminResult = document.getElementById("adminResult");
  const generatedPassword = document.getElementById("generatedPassword");
  const grandpaLink = document.getElementById("grandpaLink");
  const viewerLinks = document.getElementById("viewerLinks");
  const form = document.getElementById("joinForm");
  const errorText = document.getElementById("errorText");
  const joinTitle = document.getElementById("joinTitle");
  const passwordLabel = document.getElementById("passwordLabel");
  const passwordInput = document.getElementById("passwordInput");
  const meetNode = document.getElementById("meet");
  const connectionText = document.getElementById("connectionText");
  const leaveButton = document.getElementById("leaveButton");
  const viewerControls = document.getElementById("viewerControls");
  const grandpaControls = document.getElementById("grandpaControls");

  let currentRole = "";
  let pendingConfig = null;
  let installPrompt = null;
  let roomPassword = "";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(function (registration) {
      registration.update().catch(function () {});
    }).catch(function () {});
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    installPrompt = event;
    installButton.classList.remove("hidden");
    joinInstallButton.classList.remove("hidden");
  });

  installButton.addEventListener("click", installPwa);
  joinInstallButton.addEventListener("click", installPwa);
  generateButton.addEventListener("click", generateLinks);

  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-copy]");
    if (!button) {
      return;
    }
    copyInputValue(button.getAttribute("data-copy"), button);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    handleJoinSubmit();
  });

  leaveButton.addEventListener("click", resetCall);

  renderRoute();
  window.addEventListener("hashchange", renderRoute);

  function renderRoute() {
    showError("");
    adminPanel.classList.add("hidden");
    form.classList.add("hidden");
    pendingConfig = parseConfigFromHash();

    if (!pendingConfig || pendingConfig.mode === "admin") {
      adminPanel.classList.remove("hidden");
      return;
    }

    form.classList.remove("hidden");
    currentRole = pendingConfig.mode;
    passwordInput.value = "";

    if (pendingConfig.mode === "grandpa") {
      joinTitle.textContent = "Telefon dziadka";
      passwordLabel.classList.add("hidden");
      passwordInput.required = false;
    } else {
      joinTitle.textContent = "Podglad";
      passwordLabel.classList.remove("hidden");
      passwordInput.required = true;
    }
  }

  async function generateLinks() {
    const room = "dziadek-" + randomToken(24);
    const password = readablePassword();
    const passHash = await sha256(password);
    const grandpaKey = randomToken(18);
    const viewerKeys = Array.from({ length: VIEWER_COUNT }, function () {
      return randomToken(18);
    });

    const base = location.origin + location.pathname;
    const grandpaPayload = {
      mode: "grandpa",
      room: room,
      pass: password,
      key: grandpaKey
    };

    generatedPassword.value = password;
    grandpaLink.value = base + "#" + encodePayload(grandpaPayload);
    viewerLinks.innerHTML = "";

    viewerKeys.forEach(function (key, index) {
      const viewerPayload = {
        mode: "viewer",
        room: room,
        passHash: passHash,
        key: key
      };
      const id = "viewerLink" + index;
      const block = document.createElement("label");
      block.innerHTML = [
        "Link obserwujacego " + (index + 1),
        '<div class="copy-row">',
        '<input id="' + id + '" readonly value="' + escapeHtml(base + "#" + encodePayload(viewerPayload)) + '">',
        '<button type="button" data-copy="' + id + '">Kopiuj</button>',
        "</div>"
      ].join("");
      viewerLinks.appendChild(block);
    });

    adminResult.classList.remove("hidden");
  }

  async function handleJoinSubmit() {
    if (!pendingConfig) {
      showError("Brak konfiguracji linku.");
      return;
    }

    if (pendingConfig.mode === "viewer") {
      const password = passwordInput.value.trim();
      const hash = await sha256(password);
      if (hash !== pendingConfig.passHash) {
        showError("Nieprawidlowe haslo.");
        return;
      }
      startCall(pendingConfig.room, "viewer", password);
      return;
    }

    startCall(pendingConfig.room, "grandpa", pendingConfig.pass);
  }

  function startCall(roomName, role, password) {
    showError("");
    currentRole = role;
    roomPassword = password;

    gate.classList.add("hidden");
    call.classList.remove("hidden");
    viewerControls.classList.add("hidden");
    grandpaControls.classList.add("hidden");
    connectionText.textContent = role === "grandpa" ? "Nadaje" : "Podglad";
    meetNode.innerHTML = "";
    meetNode.appendChild(createMiroTalkFrame(roomName, role));
  }

  function createMiroTalkFrame(roomName, role) {
    const frame = document.createElement("iframe");
    const params = new URLSearchParams({
      room: roomName,
      name: role === "grandpa" ? GRANDPA_NAME : VIEWER_NAME,
      avatar: "0",
      audio: role === "grandpa" ? "1" : "0",
      video: role === "grandpa" ? "1" : "0",
      screen: "0",
      chat: "0",
      hide: "0",
      notify: "0",
      duration: "unlimited"
    });

    frame.src = MIROTALK_JOIN_URL + "?" + params.toString();
    frame.allow = "camera; microphone; autoplay; fullscreen; display-capture";
    frame.referrerPolicy = "no-referrer";
    frame.title = "Dziadek Live";
    return frame;
  }

  function resetCall() {
    meetNode.innerHTML = "";
    call.classList.add("hidden");
    gate.classList.remove("hidden");
    renderRoute();
  }

  function parseConfigFromHash() {
    const hash = location.hash.replace(/^#/, "");
    if (hash === "admin") {
      return { mode: "admin" };
    }
    if (!hash) {
      const savedConfig = loadSavedJoinConfig();
      if (savedConfig) {
        return savedConfig;
      }
      return { mode: "admin" };
    }

    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(hash))));
      if (payload.mode === "grandpa" && payload.room && payload.pass && payload.key) {
        saveJoinConfig(payload);
        return payload;
      }
      if (payload.mode === "viewer" && payload.room && payload.passHash && payload.key) {
        saveJoinConfig(payload);
        return payload;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function saveJoinConfig(payload) {
    localStorage.setItem("dziadek.joinConfig", JSON.stringify(payload));
  }

  function loadSavedJoinConfig() {
    try {
      const payload = JSON.parse(localStorage.getItem("dziadek.joinConfig") || "null");
      if (payload && (payload.mode === "grandpa" || payload.mode === "viewer")) {
        return payload;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function encodePayload(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  function readablePassword() {
    return [randomToken(3), randomToken(3), randomToken(3)].join("-");
  }

  function randomToken(length) {
    const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function (byte) {
      return alphabet[byte % alphabet.length];
    }).join("");
  }

  async function copyInputValue(id, button) {
    const input = document.getElementById(id);
    if (!input) {
      return;
    }
    await navigator.clipboard.writeText(input.value);
    const original = button.textContent;
    button.textContent = "OK";
    window.setTimeout(function () {
      button.textContent = original;
    }, 1200);
  }

  async function installPwa() {
    if (!installPrompt) {
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice.catch(function () {});
    installPrompt = null;
    installButton.classList.add("hidden");
    joinInstallButton.classList.add("hidden");
  }

  function showError(message) {
    errorText.textContent = message;
    errorText.classList.toggle("hidden", !message);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
