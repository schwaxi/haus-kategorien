// haus-kategorien v1.1.0
// Dashboard-Strategie, einzeln installierbar (Home Assistant Marketplace / HACS, Kategorie Dashboard).
// ===== Dashboard-Strategie "haus-kategorien" (Kategorien zuerst, darunter Etagen und Räume) =====
(() => {
  // Alle hausbezogenen Einstellungen (Entity-IDs, Bereiche, Geraete) kommen aus der
  // Dashboard-Konfiguration (strategy: ...). Hier stehen bewusst keine Vorgaben.
  const STD = { etagen: [] };

  const KATEGORIEN = [
    { id: "licht", titel: "Licht", icon: "mdi:lightbulb-group" },
    { id: "beschattung", titel: "Beschattung", icon: "mdi:window-shutter" },
    { id: "klima", titel: "Klima", icon: "mdi:thermostat" },
    { id: "lueftung", titel: "Lüftung", icon: "mdi:fan" },
    { id: "heizung", titel: "Heizung", icon: "mdi:radiator" },
    { id: "energie", titel: "Energie", icon: "mdi:lightning-bolt" },
    { id: "wasser", titel: "Wasser", icon: "mdi:water" },
    { id: "wetter", titel: "Wetter", icon: "mdi:weather-partly-cloudy" },
    { id: "sicherheit", titel: "Sicherheit", icon: "mdi:shield-home" },
    { id: "kameras", titel: "Kameras", icon: "mdi:cctv" },
    { id: "medien", titel: "Medien", icon: "mdi:speaker" },
    { id: "steckdosen", titel: "Steckdosen", icon: "mdi:power-socket-de" },
    { id: "garten", titel: "Garten", icon: "mdi:flower" },
  ];

  const SICHERHEIT_DC = ["door", "window", "garage_door", "opening", "motion", "occupancy", "presence",
    "smoke", "moisture", "gas", "carbon_monoxide", "vibration", "tamper", "safety", "sound"];
  const ALARM_DC = ["smoke", "moisture", "gas", "carbon_monoxide", "tamper", "safety"];
  const OFFEN_DC = ["door", "window", "garage_door", "opening"];

  const dom = (id) => id.split(".")[0];
  const obj = (id) => id.split(".")[1];
  const dc = (s) => (s && s.attributes && s.attributes.device_class) || null;

  function kontext(hass, cfg) {
    const floors = hass.floors || {};
    const areas = hass.areas || {};
    const devices = hass.devices || {};
    const ents = hass.entities || {};
    const areaOf = (id) => {
      const e = ents[id];
      if (!e) return null;
      if (e.area_id) return e.area_id;
      const d = e.device_id && devices[e.device_id];
      return (d && d.area_id) || null;
    };
    const floorOf = (areaId) => (areaId && areas[areaId] && areas[areaId].floor_id) || null;
    return { hass, cfg, floors, areas, devices, ents, areaOf, floorOf };
  }

  // Grundfilter: existiert, nicht versteckt, kein Konfig-/Diagnose-Eintrag, optional nicht "nicht verfügbar"
  function sichtbar(k, id, mitUnverfuegbar) {
    const s = k.hass.states[id];
    if (!s) return false;
    const e = k.ents[id];
    if (e && (e.hidden || e.entity_category)) return false;
    if (!mitUnverfuegbar && (s.state === "unavailable" || s.state === "unknown")) return false;
    return true;
  }

  function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Kürzt den Namen um den Raumnamen und doppelte Wörter ("Bewegungsmelder Bewegungsmelder Gang" -> "Bewegungsmelder")
  function kurz(k, id, areaName) {
    const s = k.hass.states[id];
    const orig = (s && s.attributes.friendly_name) || id;
    let n = orig;
    if (areaName) n = n.replace(new RegExp("(^|\\s)" + esc(areaName) + "(?=\\s|$)", "ig"), " ");
    const woerter = [];
    for (const w of n.replace(/\s+/g, " ").trim().split(" ")) {
      if (!woerter.length || woerter[woerter.length - 1].toLowerCase() !== w.toLowerCase()) woerter.push(w);
    }
    n = woerter.join(" ").replace(/^[-·:,\s]+|[-·:,\s]+$/g, "");
    // Vorangestelltes "Licht", "Raffstore", "Rolladen" weglassen, wenn danach noch ein Name bleibt
    const rest = n.replace(/^(Licht|Raffstore|Rolladen|Rollladen)\s+/i, "");
    if (rest.length >= 2) n = rest;
    return n.length >= 2 ? n : orig;
  }

  const ohneLeer = (o) => { Object.keys(o).forEach((x) => o[x] === undefined && delete o[x]); return o; };

  // Badges für die Raum-Überschrift: Leistungssensor je Gerät (Muster mit {objekt}), nur sichtbar solange > 0 W
  function leistungsBadges(k, ids, muster, farbe) {
    if (!muster) return [];
    return ids.map((id) => muster.replace("{objekt}", obj(id))).filter((s) => k.hass.states[s])
      .map((s) => ({ type: "entity", entity: s, show_icon: true, show_state: true, color: farbe,
        visibility: [{ condition: "numeric_state", entity: s, above: 0 }] }));
  }

  // ---------- Kategorie-Definitionen ----------
  const DEF = {
    licht: {
      raumBehalten: true, // Name bleibt vollständig ("Essbereich" statt nur "Licht")
      match: (k, id, s) => dom(id) === "light" || (dom(id) === "switch" && obj(id).includes("steckdosenlicht")),
      karte: (k, id, name) => {
        const s = k.hass.states[id];
        const modi = (s.attributes.supported_color_modes) || [];
        const dimmbar = dom(id) === "light" && modi.some((m) => m !== "onoff");
        return { type: "tile", entity: id, name, features: dimmbar ? [{ type: "light-brightness" }] : [],
          features_position: "inline", grid_options: { columns: 12 } };
      },
      // Leistung je Lampe als Badge in der Raum-Überschrift, z. B. licht_leistung: "sensor.licht_{objekt}_leistung"
      badges: (k, ids) => leistungsBadges(k, ids, k.cfg.licht_leistung, "amber"),
    },
    beschattung: {
      raumBehalten: true,
      match: (k, id, s) => dom(id) === "cover" && !["garage", "gate", "door"].includes(dc(s)) && !!k.areaOf(id),
      karte: (k, id, name) => ohneLeer({
        type: "custom:beschattung-karte", entity: id, name,
        automatik: k.hass.states["switch." + obj(id)] ? "switch." + obj(id) : undefined,
        schritte: 7, grid_options: { columns: 12 },
      }),
      // Leistung je Behang als Badge in der Raum-Überschrift, z. B. beschattung_leistung: "sensor.beschattung_{objekt}_leistung"
      badges: (k, ids) => leistungsBadges(k, ids, k.cfg.beschattung_leistung, "purple"),
      oben: (k) => {
        const c = k.cfg, cards = [{ type: "heading", heading: "Zentral", icon: "mdi:window-shutter-auto" }];
        if (k.hass.states[c.automatik_alle]) cards.push({ type: "tile", entity: c.automatik_alle, name: "Automatik alle Beschattungen",
          icon: "mdi:window-shutter-auto", color: "green", features_position: "inline", features: [{ type: "toggle" }],
          tap_action: { action: "toggle" }, grid_options: { columns: 12 } });
        const service = Object.keys(k.hass.states).filter((id) => id.startsWith(c.service_prefix)).sort();
        if (service.length) cards.push({ type: "custom:aufklapp-karte", titel: "Service Beschattung", icon: "mdi:wrench", offen: false,
          grid_options: { columns: 12 },
          cards: [{ type: "entities", state_color: true, entities: service.map((id) => ({ entity: id, icon: "mdi:wrench-outline",
            name: kurz(k, id, "Service Beschattung").replace(/^Service\s+/i, "") })) }] });
        return cards.length > 1 ? [{ type: "grid", column_span: 4, cards }] : [];
      },
    },
    klima: {
      match: (k, id, s) => {
        if (id === k.cfg.lueftung || id.includes("comfoair")) return false;
        if (k.areaOf(id) === k.cfg.heizung_raum) return false;
        if (["climate", "water_heater", "fan", "humidifier"].includes(dom(id))) return true;
        return dom(id) === "sensor" && ["temperature", "humidity"].includes(dc(s)) && !!k.areaOf(id);
      },
      karte: (k, id, name) => {
        const s = k.hass.states[id];
        if (dom(id) === "climate") {
          const f = [{ type: "target-temperature" }];
          if (s.attributes.fan_modes) f.push({ type: "climate-fan-modes", style: "icons" });
          return { type: "tile", entity: id, name, features: f, grid_options: { columns: 12 } };
        }
        return { type: "tile", entity: id, name, grid_options: { columns: 6 } };
      },
    },
    lueftung: {
      // Lüftungsanlage: Anlagenbild, Bedienung, darunter alle Werte der Anlage
      match: (k, id, s) => id.includes("comfoair") && ["sensor", "binary_sensor", "select", "switch", "number", "fan"].includes(dom(id)),
      karte: (k, id, name) => ({ type: "tile", entity: id, name: name.replace(/^comfoair\s+/i, ""), grid_options: { columns: 6 } }),
      oben: (k) => {
        const c = k.cfg, cards = [{ type: "heading", heading: "Lüftung", icon: "mdi:fan" }];
        // Anlagenbild der Lüftung mit Temperaturen, Ventilatoren, Bypass und Filter
        if (c.lueftung_bild && k.hass.states["sensor.comfoair_supply_air_temperature"]) {
          const el = (entity, top, left, extra) => Object.assign({ type: "state-label", entity, style: { top, left } }, extra || {});
          cards.push({ type: "picture-elements", image: c.lueftung_bild, grid_options: { columns: 12 }, elements: [
            el("sensor.comfoair_intake_fan_speed", "59%", "73%", { style: { top: "59%", left: "73%", color: "white" } }),
            el("sensor.comfoair_exhaust_fan_speed_rpm", "90%", "25%", { style: { top: "90%", left: "25%", color: "white" } }),
            el("sensor.comfoair_return_air_temperature", "26%", "90%"),
            el("sensor.comfoair_supply_air_temperature", "76%", "90%"),
            el("sensor.comfoair_outside_air_temperature", "26%", "10%"),
            el("sensor.comfoair_exhaust_air_temperature", "74%", "10%"),
            el("sensor.comfoair_bypass_step", "6%", "50%", { prefix: "Bypass: ", style: { top: "6%", left: "50%", color: "grey" } }),
            el("sensor.comfoair_filter_status", "92%", "50%", { prefix: "Filter ", style: { top: "92%", left: "50%", color: "red" } }),
            el("sensor.comfoair_intake_fan_speed_rpm", "16%", "25%"),
            el("sensor.comfoair_exhaust_fan_speed", "16%", "73%"),
            el("sensor.comfoair_return_air_level", "36%", "73%"),
            el("sensor.comfoair_supply_air_level", "90%", "73%"),
            el("sensor.comfoair_filter_hours", "85%", "50%"),
            el("sensor.comfoair_filter_warning_weeks", "78%", "50%"),
          ] });
        }
        if (k.hass.states[c.lueftung]) cards.push({ type: "tile", entity: c.lueftung, name: "Lüftung",
          state_content: ["fan_mode", "current_temperature"], grid_options: { columns: 12 },
          features: [{ type: "climate-fan-modes", style: "icons", fan_modes: ["off", "low", "medium", "high"] }] });
        if (k.hass.states[c.stosslueften]) cards.push({ type: "tile", entity: c.stosslueften, name: "Stoßlüften", color: "green",
          icon: "mdi:weather-windy", tap_action: { action: "perform-action", perform_action: "script.turn_on", target: { entity_id: c.stosslueften } },
          grid_options: { columns: 6 } });
        if (k.hass.states[c.stosslueften_timer]) cards.push({ type: "tile", entity: c.stosslueften_timer, name: "Dauer",
          features: [{ type: "numeric-input", style: "buttons" }], features_position: "inline", grid_options: { columns: 6 } });
        if (k.hass.states[c.filter_reset]) cards.push({ type: "tile", entity: c.filter_reset, name: "Filter zurücksetzen", grid_options: { columns: 12 } });
        if (k.hass.states[c.ueberhitzungsschutz]) cards.push({ type: "tile", entity: c.ueberhitzungsschutz, name: "Überhitzungsschutz (Stufe niedrig über 27 °C)",
          icon: "mdi:sun-thermometer", color: "light-green", features: [{ type: "toggle" }], features_position: "inline", tap_action: { action: "toggle" }, grid_options: { columns: 12 } });
        return cards.length > 1 ? [{ type: "grid", column_span: 2, cards }] : [];
      },
    },
    heizung: {
      // Alles aus dem Heizraum, gegliedert nach Gerät (Kessel, Puffer, Heizkreise, Boiler ...)
      gruppierung: "geraet",
      match: (k, id, s) => k.areaOf(id) === k.cfg.heizung_raum
        && ![k.cfg.schnecken_leistung, k.cfg.schnecken_verbrauch, k.cfg.schnecken_tag, k.cfg.schnecken_monat, ...(k.cfg.puffer || []).flatMap((p) => [p.ladezustand, p.oben, p.mitte, p.unten, p.pumpe, p.warmwasser])].includes(id),
      oben: (k) => {
        const c = k.cfg, t = (id, name, extra) => k.hass.states[id] ? [Object.assign({ type: "tile", entity: id, name, grid_options: { columns: 6 } }, extra || {})] : [];
        const puffer = [{ type: "heading", heading: "Hygienekombispeicher", icon: "mdi:storage-tank" },
          ...(c.puffer || []).flatMap((p, i) => {
            if (!k.hass.states[p.oben]) return [];
            const w = (c.waermemenge || [])[i];
            const wk = w ? [...t(w.waerme, "Wärmeinhalt", { color: "deep-orange" }), ...t(w.leistung, "Leistung netto", { color: "orange" }),
              ...t(w.heute, "Verbrauch heute", { color: "red" }), ...t(w.gesamt, "Verbrauch gesamt", { color: "red" })] : [];
            return [Object.assign({ type: "custom:puffer-karte", grid_options: { columns: 12 } }, p),
              ...(wk.length ? [{ type: "heading", heading: w.titel, heading_style: "subtitle", icon: "mdi:fire" }, ...wk] : [])];
          })];
        const strom = [{ type: "heading", heading: "Stromverbrauch Schnecken (geschätzt)", icon: "mdi:lightning-bolt" },
          ...t(c.schnecken_leistung, "Leistung jetzt", { color: "amber" }), ...t(c.schnecken_tag, "Heute", { color: "amber" }),
          ...t(c.schnecken_monat, "Dieser Monat", { color: "amber" }), ...t(c.schnecken_verbrauch, "Gesamt", { color: "amber" })];
        const kessel = [{ type: "heading", heading: "Kessel", icon: "mdi:fire" },
          ...(c.kessel && k.hass.states[c.kessel.zustand] ? [Object.assign({ type: "custom:kessel-karte", grid_options: { columns: 12 } }, c.kessel)] : [])];
        const kreise = [{ type: "heading", heading: "Heizkreise", icon: "mdi:radiator" },
          ...(c.heizkreise || []).filter((h) => k.hass.states[h.vorlauf]).map((h) => Object.assign({ type: "custom:heizkreis-karte", grid_options: { columns: 12 } }, h))];
        return [kessel, puffer, kreise, strom].filter((cards) => cards.length > 1).map((cards) => ({ type: "grid", column_span: 2, cards }));
      },
      karte: (k, id, name) => {
        const d = dom(id);
        if (d === "select") return { type: "tile", entity: id, name, features: [{ type: "select-options" }], features_position: "inline", grid_options: { columns: 12 } };
        return { type: "tile", entity: id, name, grid_options: { columns: 6 } };
      },
      // Sollwerte (number) kommen gesammelt in eine aufklappbare Karte "Einstellungen"
      einstellung: (k, id) => ["number", "input_number"].includes(dom(id)),
    },
    wasser: {
      // Wassermelder (Leckage) aus allen Räumen und weitere Wasser-Sensoren; Zähler oben
      match: (k, id, s) => {
        const c = k.cfg;
        if ([c.wasser_zaehler, c.wasser_tag, c.wasser_monat, c.wasser_teich].includes(id)) return false;
        return (dom(id) === "binary_sensor" && dc(s) === "moisture") || (dom(id) === "sensor" && dc(s) === "water");
      },
      karte: (k, id, name) => ({ type: "tile", entity: id, name, grid_options: { columns: 6 } }),
      oben: (k) => {
        const c = k.cfg, da = (id) => !!k.hass.states[id];
        const t = (id, name, extra) => da(id) ? [Object.assign({ type: "tile", entity: id, name, grid_options: { columns: 6 } }, extra || {})] : [];
        const out = [];
        const zaehler = [{ type: "heading", heading: "Wasserzähler", icon: "mdi:water-pump" },
          ...t(c.wasser_tag, "Heute", { color: "blue" }), ...t(c.wasser_monat, "Dieser Monat", { color: "blue" }),
          ...t(c.wasser_zaehler, "Zählerstand", { color: "light-blue" })];
        const teich = k.hass.states[c.wasser_teich];
        if (teich && !["unknown", "unavailable"].includes(teich.state)) zaehler.push(...t(c.wasser_teich, "Wasserstand Teich", { color: "teal" }));
        if (zaehler.length > 1) out.push({ type: "grid", column_span: 2, cards: zaehler });
        if (da(c.wasser_zaehler)) {
          const vk = customElements.get("verbrauch-karte");
          const balken = (titel, periode, tage) => vk
            ? { type: "custom:verbrauch-karte", entity: c.wasser_zaehler, titel, periode, farbe: "#29b6f6", grid_options: { columns: "full" } }
            : { type: "statistics-graph", chart_type: "bar", period: periode, stat_types: ["change"], days_to_show: tage, grid_options: { columns: "full" },
                entities: [{ entity: c.wasser_zaehler, name: "Wasser", color: "#29b6f6" }] };
          out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Verbrauch pro Tag", icon: "mdi:chart-bar" }, balken("", "day", 14)] });
          out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Verbrauch pro Stunde", icon: "mdi:chart-bar" }, balken("", "hour", 2)] });
          if (vk) out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Verbrauch pro Monat", icon: "mdi:chart-bar" }, balken("", "month", 365)] });
        }
        if (da(c.wasser_tag)) out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Verlauf Tageszähler", icon: "mdi:chart-line" },
          ((graph) => customElements.get("zeitraum-karte")
            ? { type: "custom:zeitraum-karte", titel: "wasser-verlauf", zeitraeume: [6, 24, 72, 168], standard: 24, card: graph, grid_options: { columns: "full" } }
            : Object.assign({ hours_to_show: 24, grid_options: { columns: "full" } }, graph))({ type: "history-graph", entities: [{ entity: c.wasser_tag, name: "Verbrauch seit Mitternacht", color: "#29b6f6" }] })] });
        return out;
      },
    },
    energie: {
      match: (k, id, s) => {
        if (dom(id) !== "sensor" || dc(s) !== "power") return false;
        const e = k.ents[id];
        if (e && e.platform === "solax_modbus") return false;
        const u = s.attributes.unit_of_measurement;
        return (u === "W" || u === "kW") && !!k.areaOf(id);
      },
      karte: (k, id, name) => ({ type: "tile", entity: id, name, grid_options: { columns: 6 } }),
      oben: (k) => {
        const c = k.cfg, t = (id, name, extra) => k.hass.states[id] ? [Object.assign({ type: "tile", entity: id, name, grid_options: { columns: 6 } }, extra || {})] : [];
        const cards = [{ type: "heading", heading: "Photovoltaik & Speicher", icon: "mdi:solar-power-variant" },
          ...t(c.pv, "PV-Leistung", { color: "amber" }), ...t(c.haus, "Hausverbrauch"),
          ...t(c.batterie, "Batterie", { features: [{ type: "bar-gauge", min: 0, max: 100 }], color: "green" }),
          ...t(c.batterie_leistung, "Batterie Laden/Entladen"), ...t(c.netz, "Netz (Einspeisung +)"),
          ...t(c.pv_heute, "PV heute", { color: "amber" }), ...t(c.bezug_heute, "Netzbezug heute"), ...t(c.einspeisung_heute, "Einspeisung heute")];
        const da = (ids) => ids.filter((id) => k.hass.states[id]);
        const out = [];
        // Tagesuebersicht und Monatsbilanz (eigene Karten, Teil 3)
        if (k.hass.states[c.pv_heute]) out.push({ type: "grid", column_span: 2, cards: [
          Object.assign({ type: "custom:energie-heute-karte" }, c.energie || {}, { grid_options: { columns: "full" } })] });
        if (k.hass.states[c.pv_heute]) out.push({ type: "grid", column_span: 4, cards: [
          Object.assign({ type: "custom:energie-bilanz-karte" }, c.energie || {}, { grid_options: { columns: "full" } })] });
        // Energiefluss (Karte "power-flow-card-plus" aus dem Marketplace)
        if (customElements.get("power-flow-card-plus") && k.hass.states[c.pv] && k.hass.states[c.haus]) {
          const ent = { solar: { entity: c.pv }, home: { entity: c.haus } };
          if (k.hass.states[c.netz]) ent.grid = { entity: c.netz, invert_state: true };       // SolaX: + = Einspeisung
          if (k.hass.states[c.batterie_leistung]) ent.battery = { entity: c.batterie_leistung, invert_state: true, state_of_charge: c.batterie }; // - = Entladen
          const teile = (c.haus_aufteilung || []).filter((x) => k.hass.states[x.entity]);
          if (teile.length) ent.individual = teile.map((x) => Object.assign({ display_zero: true, show_direction: false }, x));
          out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Energiefluss", icon: "mdi:transmission-tower" },
            { type: "custom:power-flow-card-plus", entities: ent, w_decimals: 0, kw_decimals: 2, watt_threshold: 1000, clickable_entities: true, grid_options: { columns: "full" } }] });
        }
        if (cards.length > 1) out.push({ type: "grid", column_span: 2, cards });
        // Verlauf: HA-eigene Karte 'Strom' (wie im Energie-Dashboard), 5-Minuten-Mittelwerte als gestapelte Flaechen.
        // Nutzt die Leistungssensoren aus den Energie-Einstellungen (PV, Netz, Batterie). Tag waehlbar ueber die Datumsauswahl.
        out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Verlauf", icon: "mdi:chart-areaspline" },
          { type: "energy-date-selection", grid_options: { columns: "full" } },
          { type: "power-sources-graph", grid_options: { columns: "full" } }] });
        // Energiemengen: HA-eigene Energiekarten (wie im Energie-Dashboard) mit eigener Datumsauswahl (Tag / Woche / Monat / Jahr).
        // Eigene collection_key, damit die Auswahl hier unabhaengig vom Verlauf oben ist. Daten aus den Energie-Einstellungen.
        out.push({ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Energiemengen", icon: "mdi:chart-bar" },
          { type: "energy-date-selection", collection_key: "energy_mengen", grid_options: { columns: "full" } },
          { type: "energy-usage-graph", collection_key: "energy_mengen", grid_options: { columns: "full" } },
          { type: "energy-solar-graph", collection_key: "energy_mengen", grid_options: { columns: "full" } }] });
        return out;
      },
    },
    wetter: {
      // Wetterwerte ohne Raum (Außenstation) – Raumwerte stehen unter Klima
      match: (k, id, s) => {
        const e = k.ents[id];
        return dom(id) === "sensor" && e && e.platform === "ecowitt" && !k.areaOf(id) && !["battery"].includes(dc(s));
      },
      karte: (k, id, name) => ({ type: "tile", entity: id, name, grid_options: { columns: 6 } }),
      ohneRaumTitel: "Wetterstation",
      // Werte der Wetterstation nach Art gliedern
      gruppen: [["Temperatur", "mdi:thermometer", /temperature|dewpoint|windchill|feels_like/],
        ["Regen", "mdi:weather-rainy", /rain/], ["Wind", "mdi:weather-windy", /wind|gust/],
        ["Luftfeuchte & Luftdruck", "mdi:gauge", /humidity|pressure/], ["Sonne & UV", "mdi:white-balance-sunny", /solar|uv|lux|illuminance/],
        ["Blitz", "mdi:flash", /lightning/]],
      oben: (k) => {
        const c = k.cfg;
        if (!k.hass.states[c.wetter]) return [];
        if (customElements.get("wetter-karte") || customElements.get("vorhersage-karte")) {
          const station = { temperatur: c.aussen_temp, luftfeuchte: c.aussen_feuchte, luftdruck: c.luftdruck,
            wind_richtung: c.wind_richtung, wind_geschwindigkeit: c.wind_geschwindigkeit };
          // Vorhersage-Karte (Tagesliste, aufklappbar) bevorzugt, sonst die beiden Grafiken
          const out = customElements.get("vorhersage-karte")
            ? [{ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Vorhersage", icon: "mdi:crystal-ball" },
                Object.assign({ type: "custom:vorhersage-karte", entity: c.wetter, kopf: true, grid_options: { columns: "full" } }, station)] }]
            : [{ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Vorhersage heute (stündlich)", icon: "mdi:crystal-ball" },
                Object.assign({ type: "custom:wetter-karte", entity: c.wetter, typ: "hourly", anzahl: 24, kopf: true, grid_options: { columns: "full" } }, station)] },
              { type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Vorhersage Woche (täglich)", icon: "mdi:calendar-week" },
                { type: "custom:wetter-karte", entity: c.wetter, typ: "daily", anzahl: 7, grid_options: { columns: "full" } }] }];
          if (customElements.get("sonnen-karte")) out.push({ type: "grid", column_span: 2, cards: [
            { type: "heading", heading: "Sonne heute", icon: "mdi:weather-sunset" }, { type: "custom:sonnen-karte", grid_options: { columns: "full" } }] });
          if (customElements.get("windrose-card") && k.hass.states[c.wind_richtung] && k.hass.states[c.wind_geschwindigkeit]) out.push({ type: "grid", column_span: 2, cards: [
            { type: "heading", heading: "Windrose", icon: "mdi:compass-rose" },
            { type: "custom:windrose-card", refresh_interval: 300, windspeed_bar_location: "bottom",
              matching_strategy: { name: "direction-first" },
              direction_labels: { cardinal_direction_letters: "NOSW", show_intercardinal_directions: true },
              wind_direction_entity: { entity: c.wind_richtung },
              windspeed_entities: [{ entity: c.wind_geschwindigkeit, name: "Wind", output_speed_unit: "kph", current_speed_arrow: true },
                ...(k.hass.states[c.wind_boee] ? [{ entity: c.wind_boee, name: "Böe", output_speed_unit: "kph", current_speed_arrow: true }] : [])],
              current_direction: { show_arrow: true },
              corner_info: {
                top_left: { label: "Wind", entity: c.wind_geschwindigkeit, unit: " km/h" },
                top_right: { label: "Richtung", entity: c.wind_richtung, input_unit: "degrees", output_unit: "letters", direction_letters: "NOSW" },
                ...(k.hass.states[c.wind_boee] ? { bottom_left: { label: "Böe", entity: c.wind_boee, unit: " km/h" } } : {}),
              },
              buttons_config: { location: "top", buttons: [
                { type: "period_selector", button_text: "24 Std", period_back: "-24h", active: true },
                { type: "period_selector", button_text: "3 Tage", period_back: "-3d" },
                { type: "period_selector", button_text: "7 Tage", period_back: "-7d" },
                ...(k.hass.states[c.wind_boee] ? [{ type: "windrose_speed_selector", windspeed_entity_index: 0, active: true, button_text: "Wind", new_row: true },
                  { type: "windrose_speed_selector", windspeed_entity_index: 1, button_text: "Böe" }] : [])] },
              grid_options: { columns: "full" } }] });
          if (customElements.get("wetter-verlauf-karte") && k.hass.states[c.aussen_temp]) out.push({ type: "grid", column_span: 2, cards: [
            { type: "heading", heading: "Gemessen (Wetterstation)", icon: "mdi:history" },
            { type: "custom:wetter-verlauf-karte", temperatur: c.aussen_temp, regen: c.regen_gesamt, wind: c.wind_geschwindigkeit, boee: c.wind_boee, ...(k.hass.states[c.luftdruck] ? { luftdruck: c.luftdruck } : {}), grid_options: { columns: "full" } }] });
          return out;
        }
        return [{ type: "grid", column_span: 2, cards: [{ type: "heading", heading: "Vorhersage", icon: "mdi:weather-partly-cloudy" },
          { type: "weather-forecast", entity: c.wetter, forecast_type: "daily", grid_options: { columns: "full" } }] }];
      },
    },
    sicherheit: {
      match: (k, id, s) => {
        const d = dom(id);
        if (d === "alarm_control_panel" && id === k.cfg.alarm && customElements.get("alarm-karte")) return false;
        if (d === "lock" || d === "alarm_control_panel") return true;
        if (d === "cover") return ["garage", "gate", "door"].includes(dc(s));
        if (d === "binary_sensor") return SICHERHEIT_DC.includes(dc(s)) || obj(id).includes("klingel");
        return false;
      },
      karte: (k, id, name) => {
        if (dom(id) === "lock") return { type: "tile", entity: id, name, features: [{ type: "lock-commands" }], grid_options: { columns: 12 } };
        if (dom(id) === "cover") return { type: "tile", entity: id, name, features: [{ type: "cover-open-close" }], grid_options: { columns: 12 } };
        return { type: "tile", entity: id, name, grid_options: { columns: 6 } };
      },
      oben: (k) => {
        const ids = Object.keys(k.hass.states).filter((id) => dom(id) === "binary_sensor" && sichtbar(k, id, true)
          && (ALARM_DC.includes(dc(k.hass.states[id])) || OFFEN_DC.includes(dc(k.hass.states[id]))));
        const alarm = k.cfg.alarm && k.hass.states[k.cfg.alarm] && customElements.get("alarm-karte")
          ? [{ type: "grid", column_span: 2, cards: [{ type: "custom:alarm-karte", entity: k.cfg.alarm }] }] : [];
        if (!ids.length) return alarm;
        return [...alarm, { type: "grid", column_span: alarm.length ? 2 : 4, cards: [{ type: "entity-filter", entities: ids, state_filter: ["on"], show_empty: false,
          card: { type: "entities", title: "Aktive Meldungen (offen / Alarm)", state_color: true } }] }];
      },
    },
    kameras: {
      mitUnverfuegbar: true,
      match: (k, id, s) => dom(id) === "camera",
      karte: (k, id, name) => ({ type: "picture-entity", entity: id, name, camera_view: "auto", show_state: false, grid_options: { columns: 12 } }),
    },
    medien: {
      // Player, die ausgeschaltet nie erreichbar sind, aber von der Karte eingeschaltet werden koennen, auch "nicht verfuegbar" zeigen:
      // power (Steckdose, z.B. Arylic), wecken (Aufwecken per HDMI-CEC ueber ein anderes Geraet) oder
      // einschalten (Skript, z.B. Wake-on-LAN beim LG webOS).
      // Gilt fuer radio, fernseher, receiver und sat.
      mitUnverfuegbarFuer: (k, id) => [...(k.cfg.radio || []), ...(k.cfg.fernseher || []), k.cfg.receiver, k.cfg.sat]
        .some((r) => r && r.entity === id && (r.power || r.wecken || r.einschalten)),
      match: (k, id, s) => {
        if (dom(id) !== "media_player") return false;
        const rx = k.cfg.receiver;
        if (rx && k.hass.states[rx.entity] && customElements.get("receiver-karte") && [rx.player, ...(rx.ausblenden || [])].includes(id)) return false;
        const tv = customElements.get("fernseher-karte") ? (k.cfg.fernseher || []).filter((t) => k.hass.states[t.entity]) : [];
        const radio = customElements.get("radio-karte") ? (k.cfg.radio || []).filter((t) => k.hass.states[t.entity]) : [];
        return ![...tv, ...radio].some((t) => [t.cast, ...(t.ausblenden || [])].includes(id));
      },
      dedupe: true,
      karte: (k, id, name) => {
        const rx = k.cfg.receiver;
        if (rx && id === rx.entity && customElements.get("receiver-karte")) {
          const { ausblenden, ...kfg } = rx;
          return { type: "custom:receiver-karte", ...kfg, grid_options: { columns: 12 } };
        }
        const sat = k.cfg.sat;
        if (sat && id === sat.entity && customElements.get("sat-karte")) return { type: "custom:sat-karte", ...sat, grid_options: { columns: 12 } };
        const tv = customElements.get("fernseher-karte") && (k.cfg.fernseher || []).find((t) => t.entity === id);
        if (tv) {
          const { ausblenden, ...kfg } = tv;
          return { type: "custom:fernseher-karte", ...kfg, grid_options: { columns: 12 } };
        }
        const radio = customElements.get("radio-karte") && (k.cfg.radio || []).find((t) => t.entity === id);
        if (radio) {
          const { ausblenden, ...kfg } = radio;
          return { type: "custom:radio-karte", ...kfg, grid_options: { columns: 12 } };
        }
        return { type: "tile", entity: id, name, grid_options: { columns: 12 },
          features: [{ type: "media-player-playback" }, { type: "media-player-volume-slider" }] };
      },
    },
    steckdosen: {
      match: (k, id, s) => dom(id) === "switch" && obj(id).startsWith("steckdose") && !obj(id).startsWith("steckdosenlicht"),
      karte: (k, id, name) => ({ type: "tile", entity: id, name, features: [{ type: "toggle" }], features_position: "inline", grid_options: { columns: 12 } }),
    },
    garten: {
      match: (k, id, s) => {
        if (k.floorOf(k.areaOf(id)) !== "aussen") return false;
        const d = dom(id);
        if (["switch", "valve", "lawn_mower", "number", "input_number"].includes(d)) return true;
        return d === "sensor" && ["temperature", "moisture", "water", "volume"].includes(dc(s));
      },
      karte: (k, id, name) => {
        const d = dom(id);
        if (d === "number" || d === "input_number") return { type: "tile", entity: id, name, features: [{ type: "numeric-input", style: "buttons" }], features_position: "inline", grid_options: { columns: 12 } };
        if (d === "lawn_mower") return { type: "tile", entity: id, name, features: [{ type: "lawn-mower-commands" }], grid_options: { columns: 12 } };
        if (d === "switch" || d === "valve") return { type: "tile", entity: id, name, features: [{ type: "toggle" }], features_position: "inline", grid_options: { columns: 12 } };
        return { type: "tile", entity: id, name, grid_options: { columns: 6 } };
      },
    },
  };

  // ---------- Etagen/Räume ----------
  function etagenReihenfolge(k) {
    const pos = (f) => { const i = (k.cfg.etagen || []).indexOf(f); return i < 0 ? 999 : i; };
    return Object.keys(k.floors).sort((a, b) => pos(a) - pos(b)
      || ((k.floors[a].level ?? 0) - (k.floors[b].level ?? 0)) || k.floors[a].name.localeCompare(k.floors[b].name));
  }

  // Geschätzte Höhe einer Karte in Rasterzeilen (für die Verteilung auf Spalten)
  function hoehe(k, karte) {
    const halb = karte.grid_options && karte.grid_options.columns === 6 ? 0.5 : 1;
    switch (karte.type) {
      case "heading": return 0.8;
      case "tile": {
        const f = (karte.features || []).length;
        return halb * (karte.features_position === "inline" || !f ? 1.2 : 1.2 + f);
      }
      case "custom:beschattung-karte": {
        const s = k.hass.states[karte.entity];
        return s && (s.attributes.supported_features & 128) ? 3.6 : 2.4;
      }
      case "picture-entity": return 4.5;
      case "custom:aufklapp-karte": return 1.2;
      case "custom:puffer-karte": return 4;
      case "custom:kessel-karte": return 4.2;
      case "custom:heizkreis-karte": return 4.2;
      case "custom:receiver-karte": return 4.5;
      case "custom:sat-karte": return 4;
      case "custom:radio-karte": return 3.8 + (karte.suche ? 0.6 : 0);
      case "custom:fernseher-karte": return ((karte.apps || []).length || (karte.sender || []).length ? 4 : (karte.eingaenge || []).length ? 3.4 : 2.5) + (karte.suche ? 0.6 : 0);
      default: return 2;
    }
  }

  // Spaltenzahl aus der Bildschirmbreite (wie die Sections-Ansicht: min. 320 px je Spalte)
  function spaltenAnzahl(cfg) {
    if (cfg.spalten) return cfg.spalten;
    const breite = (window.innerWidth || 1200) - (window.innerWidth > 870 ? 260 : 0) - 32;
    return Math.max(1, Math.min(6, Math.floor((breite + 16) / 336)));
  }

  function bereichsSections(k, ids, def, kategorie, spalten) {
    const liste = ((k.cfg.reihenfolge || {})[kategorie]) || [];
    const rang = (id) => { const i = liste.indexOf(id); return i < 0 ? 9999 : i; };
    const nachName = (x, y) => (k.hass.states[x].attributes.friendly_name || x).localeCompare(k.hass.states[y].attributes.friendly_name || y);
    const sortiert = (a, b) => rang(a) - rang(b) || nachName(a, b);
    const proRaum = new Map(), ohne = [];
    for (const id of ids) {
      const a = k.areaOf(id);
      if (a && k.areas[a]) { if (!proRaum.has(a)) proRaum.set(a, []); proRaum.get(a).push(id); } else ohne.push(id);
    }
    const raumRang = (a) => Math.min(...proRaum.get(a).map(rang));
    const block = (titel, icon, eintraege, areaName) => {
      eintraege.sort(sortiert);
      const badges = def.badges ? def.badges(k, eintraege) : [];
      const karten = [ohneLeer({ type: "heading", heading: titel, heading_style: "subtitle", icon: icon || undefined,
        badges: badges.length ? badges : undefined }),
        ...eintraege.map((id) => def.karte(k, id, kurz(k, id, def.raumBehalten ? null : areaName)))];
      return { karten, h: karten.reduce((s, c) => s + hoehe(k, c), 0) };
    };
    // Blöcke wie im Mauerwerk immer in die gerade kürzeste Spalte legen
    const verteilen = (bloecke) => {
      const n = Math.min(spalten, bloecke.length);
      const sp = Array.from({ length: n }, () => ({ h: 0, cards: [] }));
      for (const b of bloecke) {
        const z = sp.reduce((m, x) => (x.h < m.h ? x : m), sp[0]);
        z.cards.push(...b.karten); z.h += b.h + 0.5;
      }
      return sp.map((x) => ({ type: "grid", cards: x.cards }));
    };
    const sections = [];
    const raeumeAuf = (f) => [...proRaum.keys()].filter((a) => (k.areas[a].floor_id || null) === f)
      .sort((x, y) => raumRang(x) - raumRang(y) || k.areas[x].name.localeCompare(k.areas[y].name));
    for (const f of [...etagenReihenfolge(k), null]) {
      const raeume = raeumeAuf(f);
      if (!raeume.length) continue;
      const fl = f ? k.floors[f] : null;
      sections.push({ type: "grid", column_span: spalten, cards: [{ type: "heading", heading: fl ? fl.name : "Weitere Räume",
        heading_style: "title", icon: (fl && fl.icon) || "mdi:home-floor-" + (fl && fl.level != null && fl.level >= -1 && fl.level <= 3 ? (fl.level < 0 ? "negative-1" : fl.level) : "a") }] });
      sections.push(...verteilen(raeume.map((a) => block(k.areas[a].name, k.areas[a].icon, proRaum.get(a), k.areas[a].name))));
    }
    if (ohne.length && k.cfg.ohne_raum !== false && def.gruppen) {
      const g = new Map();
      for (const id of ohne) {
        const tr = def.gruppen.find(([, , re]) => re.test(id));
        const n = tr ? tr[0] : "Sonstiges";
        if (!g.has(n)) g.set(n, []); g.get(n).push(id);
      }
      const pos = (n) => { const i = def.gruppen.findIndex((x) => x[0] === n); return i < 0 ? 99 : i; };
      sections.push({ type: "grid", column_span: spalten, cards: [{ type: "heading", heading: def.ohneRaumTitel || "Weitere", heading_style: "title", icon: "mdi:weather-station" }] });
      sections.push(...verteilen([...g.keys()].sort((a, b) => pos(a) - pos(b)).map((n) => block(n, (def.gruppen.find((x) => x[0] === n) || [])[1] || "mdi:dots-horizontal", g.get(n), null))));
    } else if (ohne.length && k.cfg.ohne_raum !== false) {
      if (!def.ohneRaumTitel) sections.push({ type: "grid", column_span: spalten, cards: [{ type: "heading", heading: "Ohne Raum", heading_style: "title", icon: "mdi:help-circle-outline" }] });
      const b = block(def.ohneRaumTitel || "Ohne Raum", "mdi:help-circle-outline", ohne, null);
      sections.push(...(def.ohneRaumTitel ? [{ type: "grid", column_span: Math.min(2, spalten), cards: b.karten }] : verteilen([b])));
    }
    return sections;
  }

  function geraeteSections(k, ids, def, spalten) {
    const geraetName = (id) => {
      const e = k.ents[id], d = e && e.device_id && k.devices[e.device_id];
      return d ? (d.name_by_user || d.name || "Sonstiges") : "Sonstiges";
    };
    const liste = k.cfg.heizung_geraete || [];
    const rang = (n) => { const i = liste.indexOf(n); return i < 0 ? 999 : i; };
    const gruppen = new Map();
    for (const id of ids) { const n = geraetName(id); if (!gruppen.has(n)) gruppen.set(n, []); gruppen.get(n).push(id); }
    const ordnung = { sensor: 0, binary_sensor: 1, select: 2, switch: 3 };
    const nachTyp = (a, b) => ((ordnung[dom(a)] ?? 5) - (ordnung[dom(b)] ?? 5))
      || (k.hass.states[a].attributes.friendly_name || a).localeCompare(k.hass.states[b].attributes.friendly_name || b);
    const bloecke = [...gruppen.keys()].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b)).map((n) => {
      const alle = gruppen.get(n).sort(nachTyp);
      const werte = alle.filter((id) => !(def.einstellung && def.einstellung(k, id)));
      const sollwerte = alle.filter((id) => def.einstellung && def.einstellung(k, id));
      const karten = [{ type: "heading", heading: n, heading_style: "subtitle" },
        ...werte.map((id) => def.karte(k, id, kurz(k, id, n)))];
      if (sollwerte.length) karten.push({ type: "custom:aufklapp-karte", titel: `Einstellungen ${n}`, icon: "mdi:tune", offen: false,
        grid_options: { columns: 12 },
        cards: [{ type: "entities", entities: sollwerte.map((id) => ({ entity: id, name: kurz(k, id, n) })) }] });
      return { karten, h: karten.reduce((s, c) => s + hoehe(k, c), 0) };
    });
    const n = Math.min(spalten, bloecke.length);
    const sp = Array.from({ length: n }, () => ({ h: 0, cards: [] }));
    for (const b of bloecke) { const z = sp.reduce((m, x) => (x.h < m.h ? x : m), sp[0]); z.cards.push(...b.karten); z.h += b.h + 0.5; }
    return sp.map((x) => ({ type: "grid", cards: x.cards }));
  }

  function kategorieView(hass, cfg) {
    const k = kontext(hass, cfg);
    const def = DEF[cfg.kategorie];
    if (!def) return { type: "sections", sections: [] };
    const aus = new Set(cfg.entitaeten_ausblenden || []);
    let ids = Object.keys(hass.states).filter((id) => !aus.has(id) && sichtbar(k, id, !!def.mitUnverfuegbar || !!(def.mitUnverfuegbarFuer && def.mitUnverfuegbarFuer(k, id))) && def.match(k, id, hass.states[id]));
    if (def.dedupe) {
      const gesehen = new Set();
      ids = ids.filter((id) => { const n = (hass.states[id].attributes.friendly_name || id).toLowerCase(); if (gesehen.has(n)) return false; gesehen.add(n); return true; });
    }
    const spalten = spaltenAnzahl(cfg);
    const sections = [...(def.oben ? def.oben(k) : []),
      ...(def.gruppierung === "geraet" ? geraeteSections(k, ids, def, spalten) : bereichsSections(k, ids, def, cfg.kategorie, spalten))];
    if (!sections.length) sections.push({ type: "grid", column_span: 4, cards: [{ type: "markdown", content: "Derzeit nichts verfügbar." }] });
    // Link zum Service-Dashboard (nur fuer die eingetragenen Benutzer sichtbar)
    const sv = cfg.service, seite = sv && sv.seiten && sv.seiten[cfg.kategorie];
    if (seite && (sv.benutzer || []).length) {
      const nur = [{ condition: "user", users: sv.benutzer }];
      sections.push({ type: "grid", column_span: spalten, visibility: nur, cards: [{ type: "button", name: "Service-Einstellungen", icon: "mdi:wrench-cog",
        show_state: false, tap_action: { action: "navigate", navigation_path: `/${sv.dashboard}/${seite}` }, grid_options: { columns: 6, rows: 1 }, visibility: nur }] });
    }
    return ohneLeer({ type: "sections", max_columns: spalten, title: cfg.titel, path: cfg.kategorie, icon: cfg.icon, sections });
  }

  // ---------- Startseite ----------
  function startView(hass, cfg, basis) {
    const k = kontext(hass, cfg), c = cfg;
    const t = (id, name, extra) => hass.states[id] ? [Object.assign({ type: "tile", entity: id, name, grid_options: { columns: 6 } }, extra || {})] : [];
    const sections = [];
    sections.push({ type: "grid", cards: [{ type: "heading", heading: "Draußen", icon: "mdi:weather-partly-cloudy" },
      ...t(c.wetter, "Wetter", { features: [{ type: "temperature-forecast", forecast_type: "daily" }], grid_options: { columns: 12 } }),
      ...t(c.aussen_temp, "Außen"), ...t(c.regen_heute, "Regen heute")] });
    sections.push({ type: "grid", cards: [{ type: "heading", heading: "Energie", icon: "mdi:solar-power-variant",
      tap_action: { action: "navigate", navigation_path: `/${basis}/energie` } },
      ...t(c.pv, "PV", { color: "amber" }), ...t(c.haus, "Haus"),
      ...t(c.batterie, "Batterie", { color: "green", features: [{ type: "bar-gauge", min: 0, max: 100 }] }), ...t(c.netz, "Netz")] });
    const alarmIds = Object.keys(hass.states).filter((id) => dom(id) === "binary_sensor" && sichtbar(k, id, true)
      && (ALARM_DC.includes(dc(hass.states[id])) || OFFEN_DC.includes(dc(hass.states[id]))));
    // Status-LEDs von Geraeten (Kamera, Steckdose ...) und Konfig-/Diagnose-Lichter zaehlen nicht als Licht
    const keinLicht = Object.keys(hass.states).filter((id) => dom(id) === "light" && (k.ents[id]?.entity_category
      || /status[-_ ]?led/i.test(obj(id) + " " + (hass.states[id].attributes.friendly_name || ""))));
    sections.push({ type: "grid", cards: [{ type: "heading", heading: "Status", icon: "mdi:information-outline" },
      { type: "markdown", text_only: true, content:
        `{% set licht = states.light | selectattr('state','eq','on') | rejectattr('entity_id','in',${JSON.stringify(keinLicht)}) | list | count %}` +
        "{% set tore = states.cover | selectattr('attributes.device_class','defined') | selectattr('attributes.device_class','in',['garage','gate']) | selectattr('state','in',['open','opening']) | list | count %}" +
        "{% set offen = states.binary_sensor | selectattr('attributes.device_class','defined') | selectattr('attributes.device_class','in',['door','window','garage_door','opening']) | selectattr('state','eq','on') | list | count %}" +
        "💡 **{{ licht }}** Lichter an  \n🚗 **{{ tore }}** Tore offen  \n🚪 **{{ offen }}** Türen/Fenster offen" },
      { type: "entity-filter", entities: alarmIds, state_filter: ["on"], show_empty: false,
        card: { type: "entities", title: "Offen / Alarm", state_color: true } }] });
    sections.push({ type: "grid", cards: [{ type: "heading", heading: "Schnellzugriff", icon: "mdi:gesture-tap-button" },
      ...t(c.automatik_alle, "Beschattung Automatik", { icon: "mdi:window-shutter-auto", color: "green", features: [{ type: "toggle" }], features_position: "inline", tap_action: { action: "toggle" }, grid_options: { columns: 12 } }),
      ...t(c.haustuer, "Haustür", { features: [{ type: "lock-commands" }], grid_options: { columns: 12 } }),
      ...t(c.lueftung, "Lüftung", { state_content: ["fan_mode", "current_temperature"], features: [{ type: "climate-fan-modes", style: "icons", fan_modes: ["off", "low", "medium", "high"] }], grid_options: { columns: 12 } })] });
    sections.push({ type: "grid", column_span: 4, cards: [{ type: "heading", heading: "Bereiche", icon: "mdi:view-grid" },
      ...KATEGORIEN.map((kat) => ({ type: "shortcut", label: kat.titel, icon: kat.icon, grid_options: { columns: 3 },
        tap_action: { action: "navigate", navigation_path: `/${basis}/${kat.id}` } }))] });
    return { title: "Start", path: "start", icon: "mdi:home", type: "sections", max_columns: 4, sections };
  }

  // ---------- Grafischer Editor (Dashboard bearbeiten -> Formular statt YAML) ----------
  // Baut ein ha-form aus Abschnitten. Listen von Objekten (Puffer, Heizkreise, Fernseher ...) nutzen den
  // Objekt-Selektor mit Feldern (Hinzufügen/Bearbeiten/Entfernen); ältere HA-Versionen zeigen dort ein YAML-Feld.
  // Unbekannte Schlüssel bleiben erhalten, leere Werte werden beim Speichern entfernt.
  const ent = (domain, extra) => ({ entity: Object.assign(domain ? { domain } : {}, extra || {}) });
  const TEXT = { text: {} }, BOOL = { boolean: {} }, ICON = { icon: {} };
  const ZAHL = (min, max, step) => ({ number: Object.assign({ mode: "box" }, min != null ? { min } : {}, max != null ? { max } : {}, step ? { step } : {}) });
  const f = (name, label, selector, helper) => ohneLeer({ name, label, selector, helper });
  const feld = (label, selector, required) => ({ label, selector, required: !!required });
  const liste = (fields, label_field) => ({ object: { multiple: true, label_field, fields } });
  const objekt = (fields) => ({ object: { fields } });
  const abschnitt = (title, icon, schema, name) => name
    ? { type: "expandable", name, title, icon, schema }
    : { type: "expandable", flatten: true, name: "_" + title, title, icon, schema };
  const EIN = { power: feld("Steckdose zum Einschalten", ent("switch")), wecken: feld("Aufwecken über (HDMI-CEC)", ent("media_player")),
    einschalten: feld("Einschalt-Skript (z. B. Wake-on-LAN)", ent("script")) };
  const SENDER = liste({ name: feld("Name", TEXT, true), id: feld("Medien-ID (media-source://…)", TEXT, true), icon: feld("Icon", ICON) }, "name");

  function editorSchema(benutzer) {
    const s = ent("sensor");
    return [
      abschnitt("Allgemein", "mdi:cog", [
        f("etagen", "Etagen (Reihenfolge)", { floor: { multiple: true } }),
        f("ausblenden", "Kategorien ausblenden", { select: { multiple: true, mode: "dropdown", options: KATEGORIEN.map((k) => ({ value: k.id, label: k.titel })) } }),
        f("entitaeten_ausblenden", "Entities ausblenden", ent(null, { multiple: true })),
        f("spalten", "Spalten (leer = automatisch)", ZAHL(1, 6)),
        f("ohne_raum", "Entities ohne Raum anzeigen", BOOL),
      ]),
      abschnitt("Wetter", "mdi:weather-partly-cloudy", [
        f("wetter", "Wetter-Entity", ent("weather")), f("aussen_temp", "Außentemperatur", s), f("aussen_feuchte", "Luftfeuchte außen", s),
        f("luftdruck", "Luftdruck", s), f("regen_heute", "Regen heute", s), f("regen_gesamt", "Regen gesamt", s),
        f("wind_richtung", "Windrichtung", s), f("wind_geschwindigkeit", "Windgeschwindigkeit", s), f("wind_boee", "Windböe", s),
      ]),
      abschnitt("Energie", "mdi:solar-power-variant", [
        f("pv", "PV-Leistung", s), f("haus", "Hausverbrauch", s), f("batterie", "Batterie Ladestand", s),
        f("batterie_leistung", "Batterie Laden/Entladen", s), f("netz", "Netz (Einspeisung +)", s),
        f("pv_heute", "PV heute", s), f("bezug_heute", "Netzbezug heute", s), f("einspeisung_heute", "Einspeisung heute", s),
        f("haus_aufteilung", "Aufteilung Hausverbrauch (Energiefluss)", liste({ entity: feld("Leistung", s, true), name: feld("Name", TEXT),
          icon: feld("Icon", ICON), color: feld("Farbe (z. B. #42a5f5)", TEXT) }, "name")),
        abschnitt("Tagesübersicht & Bilanz", "mdi:chart-box", [
          f("pv", "PV heute", s), f("bezug", "Bezug heute", s), f("einspeisung", "Einspeisung heute", s),
          f("laden", "Batterie geladen heute", s), f("entladen", "Batterie entladen heute", s), f("soc", "Batterie Ladestand", s),
          f("prognose_heute", "Prognose heute", s), f("prognose_rest", "Prognose Rest heute", s), f("prognose_morgen", "Prognose morgen", s),
          f("batterie_kwh", "Batteriegröße (kWh)", ZAHL(0, null, 0.1)), f("batterie_name", "Batterie-Name", TEXT),
          f("preis_bezug", "Preis Bezug (€/kWh)", ZAHL(0, null, 0.001)), f("preis_einspeisung", "Preis Einspeisung (€/kWh)", ZAHL(0, null, 0.001)),
        ], "energie"),
      ]),
      abschnitt("Licht & Beschattung", "mdi:lightbulb-group", [
        f("licht_leistung", "Leistungssensor je Lampe (Muster)", TEXT, "{objekt} = Objekt-ID der Lampe, z. B. sensor.licht_{objekt}_leistung"),
        f("beschattung_leistung", "Leistungssensor je Behang (Muster)", TEXT, "{objekt} = Objekt-ID des Behangs, z. B. sensor.beschattung_{objekt}_leistung"),
        f("automatik_alle", "Automatik alle Beschattungen", ent(["switch", "input_boolean"])),
        f("service_prefix", "Service-Schalter (Anfang der Entity-ID)", TEXT, "Alle Entities, deren ID so beginnt, kommen in die Karte „Service Beschattung“"),
        f("haustuer", "Haustür (Schloss)", ent("lock")),
      ]),
      abschnitt("Lüftung", "mdi:fan", [
        f("lueftung", "Lüftungsanlage", ent("climate")), f("stosslueften", "Stoßlüften (Skript)", ent("script")),
        f("stosslueften_timer", "Dauer Stoßlüften", ent(["input_number", "number"])), f("filter_reset", "Filter zurücksetzen", ent(["button", "input_button", "script"])),
        f("lueftung_bild", "Anlagenbild (URL, z. B. /local/…)", TEXT), f("ueberhitzungsschutz", "Überhitzungsschutz", ent(["automation", "switch", "input_boolean"])),
      ]),
      abschnitt("Wasser", "mdi:water", [
        f("wasser_zaehler", "Wasserzähler (Zählerstand)", s), f("wasser_tag", "Verbrauch heute", s),
        f("wasser_monat", "Verbrauch Monat", s), f("wasser_teich", "Wasserstand Teich", s),
      ]),
      abschnitt("Heizung", "mdi:radiator", [
        f("heizung_raum", "Heizraum", { area: {} }),
        f("heizung_geraete", "Reihenfolge der Geräte (Gerätenamen)", { text: { multiple: true } }),
        f("schnecken_leistung", "Schnecken Leistung", s), f("schnecken_tag", "Schnecken Verbrauch heute", s),
        f("schnecken_monat", "Schnecken Verbrauch Monat", s), f("schnecken_verbrauch", "Schnecken Verbrauch gesamt", s),
        abschnitt("Kessel", "mdi:fire", [
          f("titel", "Titel", TEXT), f("zustand", "Kesselzustand", s), f("temperatur", "Kesseltemperatur", s), f("soll", "Solltemperatur", ent(["number", "sensor"])),
          f("heizen", "Heizen (an/aus)", ent("binary_sensor")), f("abgas", "Abgastemperatur", s), f("ruecklauf", "Rücklauf", s),
          f("sauerstoff", "Restsauerstoff", s), f("saugzug", "Saugzug", s), f("leistung", "Leistung", s), f("meldungen", "Aktive Meldungen", s),
          f("aschebox", "Aschebox voll", ent("binary_sensor")), f("spannung", "Spannung (Phasen)", ent("sensor", { multiple: true })),
          f("schnecken", "Schnecken (Stromaufnahme)", liste({ name: feld("Name", TEXT, true), strom: feld("Stromaufnahme", s, true) }, "name")),
          f("min", "Skala min (°C)", ZAHL()), f("max", "Skala max (°C)", ZAHL()),
        ], "kessel"),
        f("puffer", "Pufferspeicher", liste({ titel: feld("Titel", TEXT), kombi: feld("Kombispeicher (mit Warmwasser)", BOOL),
          ladezustand: feld("Ladezustand", s), oben: feld("Temperatur oben", s, true), mitte: feld("Temperatur mitte", s), unten: feld("Temperatur unten", s),
          pumpe: feld("Pufferpumpe", s), warmwasser: feld("Warmwasser", s), warmwasser_soll: feld("Warmwasser Soll", ent(["number", "sensor"])),
          waerme: feld("Wärmeinhalt", s), leistung: feld("Leistung", s), entnahme_heute: feld("Entnahme heute", s), entnahme_gesamt: feld("Entnahme gesamt", s),
          min: feld("Skala min (°C)", ZAHL()), max: feld("Skala max (°C)", ZAHL()), ungueltig_ab: feld("Ungültig ab (°C)", ZAHL()) }, "titel")),
        f("waermemenge", "Wärmemenge (je Puffer, gleiche Reihenfolge)", liste({ titel: feld("Titel", TEXT), waerme: feld("Wärmeinhalt", s),
          leistung: feld("Leistung netto", s), heute: feld("Verbrauch heute", s), gesamt: feld("Verbrauch gesamt", s) }, "titel")),
        f("heizkreise", "Heizkreise", liste({ titel: feld("Titel", TEXT),
          typ: feld("Typ", { select: { mode: "dropdown", options: [{ value: "radiator", label: "Heizkörper" }, { value: "fussboden", label: "Fußbodenheizung" }] } }),
          vorlauf: feld("Vorlauf Ist", s, true), vorlauf_soll: feld("Vorlauf Soll", s), pumpe: feld("Pumpe", ent(["binary_sensor", "sensor", "switch"])),
          raum: feld("Raumtemperatur", s), aussen: feld("Außentemperatur", s), betriebsart: feld("Betriebsart", ent(["select", "input_select"])),
          min: feld("Skala min (°C)", ZAHL()), max: feld("Skala max (°C)", ZAHL()) }, "titel")),
      ]),
      abschnitt("Sicherheit", "mdi:shield-home", [f("alarm", "Alarmanlage", ent("alarm_control_panel"))]),
      abschnitt("Medien", "mdi:speaker", [
        abschnitt("AV-Receiver", "mdi:audio-video", [
          f("entity", "Receiver (Hauptzone)", ent("media_player")), f("player", "Abspieler für Titel", ent("media_player")), f("name", "Name", TEXT),
          f("ausblenden", "Doppelte Player ausblenden", ent("media_player", { multiple: true })),
          f("weitere", "Übrige Quellen als Auswahl (Standard: an)", BOOL), f("fernbedienung", "Fernbedienung (Standard: an)", BOOL),
          f("quellen", "Quellen-Tasten", liste({ quelle: feld("Quelle (wie am Receiver)", TEXT, true), name: feld("Name", TEXT), icon: feld("Icon", ICON),
            remote: feld("Fernbedienung (remote)", ent("remote")), webos: feld("Fernbedienung (webOS-Player)", ent("media_player")) }, "name")),
          ...Object.entries(EIN).map(([n, x]) => f(n, x.label, x.selector)),
        ], "receiver"),
        abschnitt("Sat-Receiver", "mdi:satellite-variant", [
          f("entity", "Sat-Receiver", ent("media_player")), f("name", "Name", TEXT), f("tasten", "Tasten-Aktion (z. B. rest_command.vu_taste)", TEXT),
          f("tv", "Fernseher", ent("media_player")), f("tv_eingang", "Eingang am Fernseher", TEXT), f("sender", "Sender", { text: { multiple: true } }),
          ...Object.entries(EIN).map(([n, x]) => f(n, x.label, x.selector)),
        ], "sat"),
        f("radio", "Radios", liste(Object.assign({ entity: feld("Player", ent("media_player"), true), name: feld("Name", TEXT),
          cast: feld("Cast-Player", ent("media_player")) }, EIN, { suche: feld("Sendersuche", BOOL),
          laender: feld("Länder für die Suche (z. B. AT, DE)", { text: { multiple: true } }),
          ausblenden: feld("Doppelte Player ausblenden", ent("media_player", { multiple: true })), sender: feld("Sender", SENDER) }), "name")),
        f("fernseher", "Fernseher", liste(Object.assign({ entity: feld("Fernseher", ent("media_player"), true), name: feld("Name", TEXT),
          remote: feld("Fernbedienung (remote)", ent("remote")), webos: feld("webOS-Player", ent("media_player")), cast: feld("Cast-Player", ent("media_player")),
          tv: feld("Bildschirm (Player)", ent("media_player")), lautstaerke: feld("Lautstärke über", ent("media_player")),
          receiver_quelle: feld("Quelle am Receiver", TEXT) }, EIN, { fernbedienung: feld("Fernbedienung (Standard: an)", BOOL),
          suche: feld("Sendersuche", BOOL), laender: feld("Länder für die Suche (z. B. AT, DE)", { text: { multiple: true } }),
          ausblenden: feld("Doppelte Player ausblenden", ent("media_player", { multiple: true })),
          apps: feld("Apps", liste({ name: feld("Name", TEXT, true), app: feld("App / URL", TEXT), paket: feld("Paketname", TEXT), icon: feld("Icon", ICON) }, "name")),
          eingaenge: feld("Eingänge", liste({ name: feld("Name", TEXT, true), quelle: feld("Quelle (z. B. HDMI-1)", TEXT, true),
            geraet: feld("Gerät", ent("media_player")), icon: feld("Icon", ICON) }, "name")),
          sender: feld("Sender", SENDER) }), "name")),
      ]),
      abschnitt("Service-Dashboard", "mdi:wrench-cog", [
        f("dashboard", "Dashboard-Pfad (z. B. service-einstellungen)", TEXT),
        f("benutzer", "Sichtbar für", benutzer && benutzer.length
          ? { select: { multiple: true, mode: "list", options: benutzer } } : { text: { multiple: true } }),
        abschnitt("Seite je Kategorie", "mdi:file-tree", KATEGORIEN.map((k) => f(k.id, k.titel, TEXT)), "seiten"),
      ], "service"),
      abschnitt("Reihenfolge", "mdi:sort", KATEGORIEN.map((k) => f(k.id, k.titel, ent(null, { multiple: true, reorder: true }))), "reihenfolge"),
    ];
  }

  // Leere Werte ("", null, [], {}) entfernen; false und 0 bleiben
  function bereinigen(v) {
    if (Array.isArray(v)) return v.map(bereinigen).filter((x) => !leer(x));
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) { const b = bereinigen(x); if (!leer(b)) o[k] = b; }
      return o;
    }
    return v;
  }
  const leer = (x) => x === undefined || x === null || x === "" || (Array.isArray(x) && !x.length)
    || (x && typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length);

  async function formLaden() {
    if (customElements.get("ha-form")) return;
    try {
      const h = await window.loadCardHelpers();
      const c = await h.createCardElement({ type: "entities", entities: [] });
      await c.constructor.getConfigElement();
    } catch (e) { /* ha-form kommt dann mit dem Dialog */ }
    await Promise.race([customElements.whenDefined("ha-form"), new Promise((r) => setTimeout(r, 3000))]);
  }

  class HausKategorienEditor extends HTMLElement {
    set hass(h) {
      this._hass = h;
      if (this._form) this._form.hass = h;
      this._benutzerLaden();
    }
    setConfig(config) {
      this._config = config || {};
      this._render();
    }
    async connectedCallback() {
      await formLaden();
      this._render();
    }
    async _benutzerLaden() {
      if (this._benutzerGeladen || !this._hass || !this._hass.user || !this._hass.user.is_admin) return;
      this._benutzerGeladen = true;
      try {
        const u = await this._hass.callWS({ type: "config/auth/list" });
        this._benutzer = u.filter((x) => !x.system_generated).map((x) => ({ value: x.id, label: x.name || x.username || x.id }));
        this._schema = null;
        this._render();
      } catch (e) { /* ohne Adminrechte: Benutzer-IDs als Text */ }
    }
    _render() {
      if (!this._config || !customElements.get("ha-form")) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => s.label || s.title || s.name;
        this._form.computeHelper = (s) => s.helper;
        this._form.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._geaendert(ev.detail.value); });
        this.appendChild(this._form);
      }
      if (!this._schema) this._schema = editorSchema(this._benutzer);
      const c = this._config;
      // Verschachtelte Abschnitte brauchen ein Objekt, "ohne_raum" ist standardmäßig an
      const sv = Object.assign({}, c.service, { seiten: Object.assign({}, c.service && c.service.seiten) });
      this._form.hass = this._hass;
      this._form.schema = this._schema;
      this._form.data = Object.assign({}, c, { ohne_raum: c.ohne_raum !== false, energie: Object.assign({}, c.energie),
        kessel: Object.assign({}, c.kessel), receiver: Object.assign({}, c.receiver), sat: Object.assign({}, c.sat),
        service: sv, reihenfolge: Object.assign({}, c.reihenfolge) });
    }
    _geaendert(wert) {
      const v = Object.assign({}, wert);
      for (const k of Object.keys(v)) if (k.startsWith("_")) delete v[k];
      if (v.ohne_raum !== false) delete v.ohne_raum;
      const neu = Object.assign({ type: this._config.type || "custom:haus-kategorien" }, bereinigen(v));
      if (v.ohne_raum === false) neu.ohne_raum = false;
      this._config = neu;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: neu }, bubbles: true, composed: true }));
    }
  }
  if (!customElements.get("haus-kategorien-editor")) customElements.define("haus-kategorien-editor", HausKategorienEditor);

  // ---------- Registrierung ----------
  class HausKategorienStrategie extends HTMLElement {
    static async getConfigElement() {
      return document.createElement("haus-kategorien-editor");
    }

    static async generate(config, hass) {
      const cfg = Object.assign({}, STD, config || {});
      delete cfg.type;
      const basis = (window.location.pathname.split("/")[1]) || "dashboard-haus";
      const aus = new Set(cfg.ausblenden || []);
      return {
        views: [startView(hass, cfg, basis),
          ...KATEGORIEN.filter((kat) => !aus.has(kat.id)).map((kat) => ({ title: kat.titel, path: kat.id, icon: kat.icon,
            strategy: Object.assign({}, cfg, { type: "custom:haus-kategorie", kategorie: kat.id, titel: kat.titel, icon: kat.icon }) }))],
      };
    }
  }
  class HausKategorieView extends HTMLElement {
    static async generate(config, hass) {
      const cfg = Object.assign({}, STD, config || {});
      return kategorieView(hass, cfg);
    }
  }
  if (!customElements.get("ll-strategy-dashboard-haus-kategorien")) customElements.define("ll-strategy-dashboard-haus-kategorien", HausKategorienStrategie);
  if (!customElements.get("ll-strategy-view-haus-kategorie")) customElements.define("ll-strategy-view-haus-kategorie", HausKategorieView);
})();

console.info("%c haus-kategorien %c v1.1.0 ", "color:#fff;background:#03a9f4;font-weight:700", "color:#03a9f4");
