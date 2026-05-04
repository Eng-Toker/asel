// realtime.js — Supabase WebSocket realtime bağlantısı

import { SB, KEY } from "./config.js";
import { app }     from "./state.js";
import { debounce } from "./utils.js";
import { oturumYukle, isMisafir } from "./auth.js";

let _realtimeChannel = null;

export function realtimeBaslat() {
  if (isMisafir()) return;
  if (_realtimeChannel) return;
  const token  = oturumYukle()?.token || KEY;
  const wsUrl  = SB.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + KEY + "&vsn=1.0.0";
  const ws     = new WebSocket(wsUrl);
  let heartbeatInterval;

  // bolge sütunu olan tablolar → server-side filter ile sadece kendi
  // bölgesinin event'leri gelir. Child tablolarda bolge yok, refresh
  // debounce'ı zaten veriYukle'yi bolge filtreli çağırıyor.
  const TOPICS_WITH_BOLGE = ["santiye_records", "santiyeler", "santiye_log", "santiye_notlar"];
  const TOPICS_NO_BOLGE   = ["record_asamalar", "record_fotograflar"];
  const bolgeSuffix = app.bolge ? `:bolge=eq.${encodeURIComponent(app.bolge)}` : "";

  ws.onopen = () => {
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
  };

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
  }, 500);

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
    if (oturumYukle()) setTimeout(realtimeBaslat, 5000);
  };

  _realtimeChannel = ws;
}

export function realtimeDurdur() {
  if (_realtimeChannel) {
    _realtimeChannel.close();
    _realtimeChannel = null;
  }
}
