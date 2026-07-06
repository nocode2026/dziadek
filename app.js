(function () {
  const GRANDPA_NAME = "Dziadek";
  const VIEWER_NAME = "Viewer";
  const JITSI_DOMAIN = "meet.jit.si";
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
  const listenButton = document.getElementById("listenButton");
  const talkButton = document.getElementById("talkButton");
  const cameraButton = document.getElementById("cameraButton");
  const micButton = document.getElementById("micButton");

  let api = null;
  let currentRole = "";
  let pendingConfig = null;
  let installPrompt = null;
  let roomPassword = "";
  let grandpaParticipantId = "";
  let grandpaMuted = false;
  let viewerMicOpen = false;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
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
  listenButton.addEventListener("click", toggleGrandpaAudio);
  cameraButton.addEventListener("click", function () {
    api && api.executeCommand("toggleVideo");
  });
  micButton.addEventListener("click", function () {
    api && api.executeCommand("toggleAudio");
  });

  ["pointerdown", "touchstart", "mousedown"].forEach(function (name) {
    talkButton.addEventListener(name, beginTalk);
  });

  ["pointerup", "pointercancel", "pointerleave", "touchend", "touchcancel", "mouseup", "mouseleave"].forEach(function (name) {
    talkButton.addEventListener(name, endTalk);
  });

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
    if (!window.JitsiMeetExternalAPI) {
      showError("Nie zaladowano Jitsi. Sprawdz internet i odswiez.");
      return;
    }

    showError("");
    currentRole = role;
    roomPassword = password;
    grandpaParticipantId = "";
    grandpaMuted = false;
    viewerMicOpen = false;

    gate.classList.add("hidden");
    call.classList.remove("hidden");
    viewerControls.classList.toggle("hidden", role !== "viewer");
    grandpaControls.classList.toggle("hidden", role !== "grandpa");
    connectionText.textContent = "Laczenie";

    api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName: roomName,
      parentNode: meetNode,
      width: "100%",
      height: "100%",
      userInfo: {
        displayName: role === "grandpa" ? GRANDPA_NAME : VIEWER_NAME
      },
      configOverwrite: {
        disableDeepLinking: true,
        disableInviteFunctions: true,
        disableThirdPartyRequests: true,
        deeplinking: {
          disabled: true
        },
        prejoinConfig: { enabled: false },
        startWithAudioMuted: role === "viewer",
        startWithVideoMuted: role === "viewer",
        startSilent: false,
        enableWelcomePage: false,
        toolbarButtons: []
      },
      interfaceConfigOverwrite: {
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        TILE_VIEW_MAX_COLUMNS: 1
      }
    });

    wireJitsiEvents();
  }

  function wireJitsiEvents() {
    api.addEventListener("videoConferenceJoined", function () {
      connectionText.textContent = currentRole === "grandpa" ? "Nadaje" : "Podglad";
      if (currentRole === "viewer") {
        forceViewerMuted();
      }
      refreshParticipants();
    });

    api.addEventListener("participantRoleChanged", function (event) {
      if (event.role === "moderator" && roomPassword) {
        api.executeCommand("password", roomPassword);
      }
    });

    api.addEventListener("passwordRequired", function () {
      if (roomPassword) {
        api.executeCommand("password", roomPassword);
      }
    });

    api.addEventListener("participantJoined", refreshParticipants);
    api.addEventListener("participantLeft", refreshParticipants);
    api.addEventListener("displayNameChange", refreshParticipants);

    api.addEventListener("audioMuteStatusChanged", function (event) {
      if (currentRole === "viewer" && !viewerMicOpen && event.muted === false) {
        forceViewerMuted();
      }
      if (currentRole === "grandpa") {
        micButton.classList.toggle("active", event.muted === false);
      }
    });

    api.addEventListener("videoMuteStatusChanged", function (event) {
      if (currentRole === "grandpa") {
        cameraButton.classList.toggle("active", event.muted === false);
      }
    });
  }

  function beginTalk(event) {
    event.preventDefault();
    if (!api || viewerMicOpen) {
      return;
    }
    viewerMicOpen = true;
    talkButton.classList.add("active");
    api.isAudioMuted().then(function (muted) {
      if (muted) {
        api.executeCommand("toggleAudio");
      }
    });
  }

  function endTalk(event) {
    event.preventDefault();
    if (!api || !viewerMicOpen) {
      return;
    }
    viewerMicOpen = false;
    talkButton.classList.remove("active");
    forceViewerMuted();
  }

  function forceViewerMuted() {
    api.isAudioMuted().then(function (muted) {
      if (!muted) {
        api.executeCommand("toggleAudio");
      }
    });
  }

  function toggleGrandpaAudio() {
    grandpaMuted = !grandpaMuted;
    listenButton.classList.toggle("active", grandpaMuted);
    listenButton.textContent = grandpaMuted ? "Wlacz dziadka" : "Wycisz dziadka";
    setGrandpaVolume(grandpaMuted ? 0 : 1);
  }

  function setGrandpaVolume(volume) {
    if (api && grandpaParticipantId) {
      api.executeCommand("setParticipantVolume", grandpaParticipantId, volume);
    }
  }

  function refreshParticipants() {
    if (!api || currentRole !== "viewer") {
      return;
    }

    api.getRoomsInfo().then(function (data) {
      const rooms = data && data.rooms ? data.rooms : [];
      const participants = rooms.flatMap(function (room) {
        return room.participants || [];
      });
      const grandpa = participants.find(function (participant) {
        return participant.displayName === GRANDPA_NAME;
      });

      grandpaParticipantId = grandpa ? grandpa.id : "";
      if (grandpaParticipantId && grandpaMuted) {
        setGrandpaVolume(0);
      }
    }).catch(function () {});
  }

  function resetCall() {
    if (api) {
      api.dispose();
      api = null;
    }
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
