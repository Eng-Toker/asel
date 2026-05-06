// realtime.js — Supabase WebSocket realtime bağlantısı

import { SB, KEY } from "./config.js";
import { app }     from "./state.js";
import { debounce } from "./utils.js";
import { oturumYukle, isMisafir } from "./auth.js";

let _realtimeChannel = null;
let _backoffMs = 1000;
const BACKOFF_MIN = 1000;
const BACKOFF_MAX = 30000;
let _stopped = false;
let _visibilityHooked = false;
let _hasConnectedOnce = false;

const refresh = debounce(async () => {
  const { veriYukle } = await import("./data.js");
  const { tumHavaYenile } = await import("./views/projects.js");
  const { renderSantiyeler } = await import("./views/projects.js");
  const { renderDetay }      = await import("./views/detail.js");
  const { renderLog }        = await import("./views/log.js");
  const { renderDashboard }  = await import("./views/dashboard.js");

  await veriYukle({ sessiz: true });
  tumHavaYenile().catch(() => {});
  if (app.aktifView === "projects") renderSantiyeler();
  else if (app.aktifView === "detail" && app.secilenSantiye) renderDetay();
  else if (app.aktifView === "log") renderLog();
  else if (app.aktifView === "dashboard") renderDashboard();
  else if (app.aktifView === "stok") {
    const { renderStok } = await import("./views/stok.js");
    renderStok();
  }
  else if (app.aktifView === "harita") {
    const { renderHarita } = await import("./views/harita.js");
    renderHarita();
  }
}, 500);

function _scheduleReconnect() {
  if (_stopped) return;
  if (isMisafir()) return;
  if (!oturumYukle()) return;
  setTimeout(() => realtimeBaslat(), _backoffMs);
  _backoffMs = Math.min(_backoffMs * 2, BACKOFF_MAX);
}

function _hookVisibility() {
  if (_visibilityHooked) return;
  _visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (_stopped || isMisafir() || !oturumYukle()) return;
    const ws = _realtimeChannel;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      _backoffMs = BACKOFF_MIN;
      realtimeBaslat();
    }
  });
}

export function realtimeBaslat() {
  if (isMisafir()) return;
  if (_realtimeChannel &&
      (_realtimeChannel.readyState === WebSocket.OPEN ||
       _realtimeChannel.readyState === WebSocket.CONNECTING)) return;
  _stopped = false;
  _hookVisibility();

  const token  = oturumYukle()?.token || KEY;
  const wsUrl  = SB.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + KEY + "&vsn=1.0.0";
  const ws     = new WebSocket(wsUrl);
  let heartbeatInterval;

  // bolge sütunu olan tablolar → server-side filter ile sadece kendi
  // bölgesinin event'leri gelir. Child tablolarda bolge yok, refresh
  // debounce'ı zaten veriYukle'yi bolge filtreli çağırıyor.
  const TOPICS_WITH_BOLGE = ["santiye_records", "santiyeler", "santiye_log", "santiye_notlar", "malzeme_stok", "stok_hareket"];
  const TOPICS_NO_BOLGE   = ["record_asamalar", "record_fotograflar"];
  const bolgeSuffix = app.bolge ? `:bolge=eq.${encodeURIComponent(app.bolge)}` : "";

  ws.onopen = () => {
    _backoffMs = BACKOFF_MIN;
    ws.send(JSON.stringify({ topic: "realtime:*", event: "phx_join", payload: { access_token: token }, ref: "1" }));
    let ref = 2;
    TOPICS_WITH_BOLGE.forEach((t) =>
      ws.send(JSON.stringify({ topic: `realtime:public:${t}${bolgeSuffix}`, event: "phx_join", payload: {}, ref: String(ref++) }))
    );
    TOPICS_NO_BOLGE.forEach((t) =>
      ws.send(JSON.stringify({ topic: `realtime:public:${t}`, event: "phx_join", payload: {}, ref: String(ref++) }))
    );
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "0" }));
    }, 30000);
    // Reconnect sonrası state resync — ilk connect'te bolgeSec()
    // zaten veriYukle çağırdı, ikinci açılıştan itibaren resync gerekli.
    if (_hasConnectedOnce) refresh();
    _hasConnectedOnce = true;
  };

  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === "INSERT" || msg.event === "UPDATE" || msg.event === "DELETE") refresh();
    } catch {}
  };

  ws.onerror = () => {};
  ws.onclose = () => {
    clearInterval(heartbeatInterval);
    _realtimeChannel = null;
    _scheduleReconnect();
  };

  _realtimeChannel = ws;
}

export function realtimeDurdur() {
  _stopped = true;
  _backoffMs = BACKOFF_MIN;
  _hasConnectedOnce = false;
  if (_realtimeChannel) {
    _realtimeChannel.close();
    _realtimeChannel = null;
  }
}
