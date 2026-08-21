/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, PLACE_SLUG, send } from "./utils/api";
import { flushQueue, queueOperation, queueSize } from "./utils/offline";
import "./index.css";

const STATUS = {
  confirmed: "Confirmado", pending_confirmation: "Pendente", waitlist: "Lista de espera",
  cancelled: "Cancelado", present: "Presente", justified_absence: "Falta justificada",
  unjustified_absence: "Falta injustificada", scheduled: "Agendado",
};
const fmtDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const initialSkills = { knowledge_level: 5, reception: 5, setting: 5, blocking: 5, serving: 5, attack: 5, defense: 5 };

function useLoad(path, fallback = []) {
  const [data, setData] = useState(fallback);
  const [error, setError] = useState("");
  const reload = async () => {
    if (!path) return;
    try { setData(await api(path)); setError(""); } catch (err) { setError(err.message); }
  };
  useEffect(() => {
    if (!path) return undefined;
    let active = true;
    api(path).then((value) => { if (active) { setData(value); setError(""); } })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [path]);
  return [data, reload, error];
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Button({ children, tone = "primary", ...props }) { return <button className={`button ${tone}`} {...props}>{children}</button>; }
function Badge({ status }) { return <span className={`badge ${status}`}>{STATUS[status] || status}</span>; }
function Empty({ children = "Nenhum registro por aqui ainda." }) { return <div className="empty">{children}</div>; }
function Notice({ children, tone = "info" }) { return children ? <div className={`notice ${tone}`}>{children}</div> : null; }
function AppFooter({ place }) { return <footer><span>© {new Date().getFullYear()} VoleiFlow · {place || "Gestão de jogos e inscrições"}</span><span>Feito para funcionar até com sinal ruim.</span></footer>; }

const themeLogo = (theme) => `/favicon.svg#${theme === "dark" ? "dark" : "light"}`;

function syncThemeAssets(theme) {
  const favicon = document.querySelector('link[rel="icon"]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (favicon) favicon.href = themeLogo(theme);
  if (themeColor) themeColor.content = theme === "dark" ? "#0d1512" : "#122a23";
  window.dispatchEvent(new CustomEvent("voleiflow:theme", { detail: theme }));
}

function ThemedLogo(props) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useEffect(() => {
    const update = (event) => setTheme(event.detail);
    window.addEventListener("voleiflow:theme", update);
    return () => window.removeEventListener("voleiflow:theme", update);
  }, []);
  return <img {...props} src={themeLogo(theme)} />;
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("voleiflow_theme", next);
    syncThemeAssets(next);
    setTheme(next);
  };
  return <button className="theme-toggle" onClick={toggle} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} title={theme === "dark" ? "Modo claro" : "Modo escuro"}>{theme === "dark" ? "☀" : "☾"}</button>;
}

function PlayerSearchSelect({ value, onChange, initialPlayers = [], placeholder = "Selecione seu cadastro" }) {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState(() => initialPlayers.slice(0, 25));
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState(null);
  const selected = (chosen?.id === Number(value) ? chosen : null)
    || players.find((item) => item.id === Number(value))
    || initialPlayers.find((item) => item.id === Number(value));

  useEffect(() => {
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await api(`/public/players?per_page=25&search=${encodeURIComponent(query.trim())}`);
        if (active) setPlayers(result.items || []);
      } catch {
        if (active) setPlayers([]);
      } finally {
        if (active) setLoading(false);
      }
    }, query.trim() ? 300 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query]);

  const choose = (player) => {
    setChosen(player);
    onChange(player);
    setQuery("");
    setOpen(false);
  };

  return <div className={`player-select ${open ? "open" : ""}`} ref={rootRef}>
    <button type="button" className="player-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {selected ? <span><b>{selected.name}</b><small>{selected.email}</small></span> : <span className="player-select-placeholder">{placeholder}</span>}
      <i>⌄</i>
    </button>
    {open && <div className="player-select-menu">
      <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar jogador" />
      <div className="player-select-options" role="listbox">
        {loading && <span className="player-select-status">Buscando…</span>}
        {!loading && players.map((player) => <button type="button" role="option" aria-selected={player.id === Number(value)} key={player.id} onClick={() => choose(player)}><b>{player.name}</b><small>{player.email}</small></button>)}
        {!loading && !players.length && <span className="player-select-status">Nenhum jogador encontrado.</span>}
      </div>
    </div>}
  </div>;
}

function Connectivity() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(queueSize());
  const [conflicts, setConflicts] = useState(0);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) flushQueue(); };
    const queue = (event) => setPending(event.detail);
    const conflict = (event) => setConflicts(event.detail.length);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    window.addEventListener("voleiflow:queue", queue); window.addEventListener("voleiflow:conflict", conflict); flushQueue();
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("voleiflow:queue", queue); window.removeEventListener("voleiflow:conflict", conflict); };
  }, []);
  return <div className={`connectivity ${online ? "online" : "offline"}`} title={conflicts ? "Revise os dados do evento antes de reenviar alterações conflitantes." : ""}><span />{online ? "Online" : "Offline"}{pending > 0 && ` · ${pending} aguardando envio`}{conflicts > 0 && ` · ${conflicts} conflito(s)`}</div>;
}

function Signup({ bootstrap, reload }) {
  const events = bootstrap.events || [];
  const players = bootstrap.players?.items || [];
  const positions = bootstrap.positions || [];
  const [form, setForm] = useState({ event_id: "", player_id: "", shift_id: "", primary_position_id: "", secondary_position_id: "", is_guest: false, notes: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const event = events.find((item) => item.id === Number(form.event_id));
  const canSubmit = Boolean(form.event_id && form.player_id && form.shift_id && form.primary_position_id);
  const submit = async (e) => {
    e.preventDefault(); setError(""); setMessage("");
    if (!canSubmit) {
      setError("Selecione o jogo, seu nome, a posição principal e o turno.");
      return;
    }
    try {
      await send("/registrations", "POST", {
        event_id: Number(form.event_id), player_id: Number(form.player_id), shift_id: Number(form.shift_id),
        primary_position_id: Number(form.primary_position_id),
        secondary_position_id: form.secondary_position_id ? Number(form.secondary_position_id) : null,
        is_guest: form.is_guest, notes: form.notes,
      });
      setMessage("Inscrição recebida! Confira seu e-mail para garantir a prioridade da vaga."); reload();
    } catch (err) { setError(err.message); }
  };
  const whatsapp = String(bootstrap.settings?.admin_whatsapp || "").replace(/\D/g, "");
  return <section className="split hero-section">
    <div className="hero-copy"><span className="eyebrow">Sua próxima partida começa aqui</span><h1>Entre em quadra.<br /><em>O Flow cuida do resto.</em></h1><p>Inscreva-se em poucos segundos, confirme sua presença e acompanhe seu time.</p>{bootstrap.place && <div className="place-info"><b>{bootstrap.place.name}</b>{bootstrap.place.address ? <span>{[bootstrap.place.address, bootstrap.place.neighborhood, bootstrap.place.city, bootstrap.place.state].filter(Boolean).join(" · ")}</span> : <span>Endereço em atualização</span>}{bootstrap.place.maps_url && <a href={bootstrap.place.maps_url} target="_blank" rel="noreferrer">Ver como chegar</a>}</div>}<div className="rule"><b>01</b><span>Escolha o jogo</span><b>02</b><span>Confirme por e-mail</span><b>03</b><span>Veja seu time</span></div></div>
    <form className="card signup-card" onSubmit={submit}><div className="card-title"><span>Inscrição</span><small>Leva menos de 1 minuto</small></div>
      <Notice tone="success">{message}</Notice><Notice tone="error">{error}</Notice>
      <Field label="Jogo"><select required value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value, shift_id: "" })}><option value="">Selecione a data</option>{events.map((item) => <option value={item.id} key={item.id}>{fmtDate(item.game_date)} · {item.starts_at.slice(0, 5)} · {item.title}</option>)}</select></Field>
      <Field label="Seu nome"><PlayerSearchSelect value={form.player_id} initialPlayers={players} onChange={(selected) => setForm({ ...form, player_id: selected.id, primary_position_id: selected.primary_position_id || "", secondary_position_id: selected.secondary_position_id || "", is_guest: selected.is_guest || false })} /></Field>
      <Field label="Participação"><select value={form.is_guest ? "guest" : "member"} onChange={(e) => setForm({ ...form, is_guest: e.target.value === "guest" })}><option value="member">Membro</option><option value="guest">Convidado</option></select></Field>
      <div className="form-row"><Field label="Posição principal"><select required value={form.primary_position_id} onChange={(e) => setForm({ ...form, primary_position_id: e.target.value })}><option value="">Selecione</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Posição secundária"><select value={form.secondary_position_id} onChange={(e) => setForm({ ...form, secondary_position_id: e.target.value })}><option value="">Nenhuma</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>
      <Field label="Turno"><select required disabled={!event} value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })}><option value="">Selecione</option>{event?.shifts.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)}</option>)}</select></Field>
      <Field label="Observação (opcional)"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Atraso, saída antecipada ou limitação de horário" /></Field>
      <Button type="submit" disabled={!canSubmit}>Confirmar inscrição <span>→</span></Button>
      <p className="form-help">Não encontrou seu nome? {whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Fale com os administradores</a> : "Peça seu cadastro ao administrador."}</p>
    </form>
  </section>;
}

function PublicTeamCard({ team, playerId, periodText, ownTeam = false }) {
  return <article className={`team-card ${ownTeam ? "is-player-team" : ""}`} key={team.id}>
    <header><div><span>#{team.number}</span><h3>{team.name}</h3></div>{ownTeam && <b>Seu time</b>}</header>
    <div className="team-members">{team.members.map((member) => {
      const isCurrentPlayer = member.registration.player_id === Number(playerId);
      return <div className={isCurrentPlayer ? "current-player" : ""} key={member.id}><div><b>{member.registration.player_name}{isCurrentPlayer && " · você"}</b><small>{member.position}</small><small>{periodText(member.registration.selected_periods)}</small></div></div>;
    })}</div>
  </article>;
}

function PlayerFormation({ formation, playerId, periodText }) {
  const myTeams = formation.teams.filter((team) => team.members.some(
    (member) => member.registration.player_id === Number(playerId),
  ));
  const opponentTeams = formation.teams.filter((team) => !myTeams.some((mine) => mine.id === team.id));

  return <section className="player-formation" key={formation.formation_shift_id}>
    <div className="section-heading"><div><span className="eyebrow">Formação publicada</span><h3>{periodText(formation.linked_shifts)}</h3></div><span>{formation.teams.length} time(s)</span></div>
    {myTeams.length > 0 && <section className="player-formation-group is-own-team"><header><span>🏐 Seu time</span><small>Confira seus companheiros e horários.</small></header><div className="teams-board public-teams">{myTeams.map((team) => <PublicTeamCard team={team} playerId={playerId} periodText={periodText} ownTeam />)}</div></section>}
    {opponentTeams.length > 0 && <section className="player-formation-group"><header><span>👀 Times adversários</span><small>Conheça os outros times antes de entrar em quadra.</small></header><div className="teams-board public-teams">{opponentTeams.map((team) => <PublicTeamCard team={team} playerId={playerId} periodText={periodText} />)}</div></section>}
  </section>;
}

function Situation({ bootstrap }) {
  const [playerId, setPlayerId] = useState(""); const [eventId, setEventId] = useState(""); const [result, setResult] = useState({ items: [], formations: [] }); const [searched, setSearched] = useState(false); const [error, setError] = useState("");
  const search = async () => { try { const data = await api(`/players/${playerId}/events/${eventId}/situation`); setResult({ items: data.items || [], formations: data.formations || [] }); setSearched(true); setError(""); } catch (err) { setError(err.message); } };
  const periodText = (periods = []) => (periods || []).filter(Boolean).map((period) => `${period.name} · ${period.starts_at.slice(0, 5)}–${period.ends_at.slice(0, 5)}`).join(" + ");
  return <section className="page"><div className="page-heading"><span className="eyebrow">Área do jogador</span><h2>Meus times</h2><p>Consulte sua confirmação e veja todos os jogadores dos times já formados.</p></div><div className="card player-teams-search">
    <div className="form-row"><Field label="Jogador"><PlayerSearchSelect value={playerId} initialPlayers={bootstrap.players?.items || []} placeholder="Selecione o jogador" onChange={(selected) => setPlayerId(selected.id)} /></Field><Field label="Evento"><select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Selecione</option>{bootstrap.events?.map((item) => <option key={item.id} value={item.id}>{fmtDate(item.game_date)} · {item.title}</option>)}</select></Field></div><Button disabled={!playerId || !eventId} onClick={search}>Consultar</Button><Notice tone="error">{error}</Notice>
    <div className="situation-list">{result.items.map((item) => <article key={item.id}><Badge status={item.status} /><h3>{item.team || "Time ainda não definido"}</h3><p>{item.assigned_position || item.primary_position}</p><small>{periodText([item.selected_period])}</small>{item.notes && <small>{item.notes}</small>}</article>)}</div>{searched && !result.items.length && <Empty>Você ainda não está inscrito neste evento.</Empty>}
  </div>{result.formations.map((formation) => <PlayerFormation formation={formation} playerId={playerId} periodText={periodText} key={formation.formation_shift_id} />)}{searched && result.items.length > 0 && !result.formations.length && <Empty>Os times deste período ainda não foram formados.</Empty>}</section>;
}

function PlayersAdmin({ positions }) {
  const [search, setSearch] = useState("");
  const [result, reload, error] = useLoad(`/players?per_page=100&search=${encodeURIComponent(search)}`, { items: [] });
  const blank = { name: "", email: "", phone: "", birth_date: "", is_guest: false, invited_by: "", primary_position_id: "", secondary_position_id: "", ...initialSkills };
  const [form, setForm] = useState(blank); const [editing, setEditing] = useState(null); const [message, setMessage] = useState("");
  const save = async (e) => { e.preventDefault(); try { await send(editing ? `/players/${editing}` : "/players", editing ? "PATCH" : "POST", form); setForm(blank); setEditing(null); setMessage("Jogador salvo."); reload(); } catch (err) { setMessage(err.message); } };
  const edit = (item) => { setEditing(item.id); setForm(Object.fromEntries(Object.keys(blank).map((key) => [key, item[key] ?? ""]))); };
  return <div className="admin-grid"><form className="card sticky-form" onSubmit={save}><h3>{editing ? "Editar jogador" : "Novo jogador"}</h3><Notice>{message}</Notice><Field label="Nome"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="E-mail"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="WhatsApp"><input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="Vínculo"><select value={form.is_guest ? "guest" : "member"} onChange={(e) => setForm({ ...form, is_guest: e.target.value === "guest", invited_by: e.target.value === "guest" ? form.invited_by : "" })}><option value="member">Membro</option><option value="guest">Convidado</option></select></Field>{form.is_guest && <Field label="Quem convidou"><input value={form.invited_by} onChange={(e) => setForm({ ...form, invited_by: e.target.value })} /></Field>}<div className="form-row"><Field label="Principal"><select required value={form.primary_position_id} onChange={(e) => setForm({ ...form, primary_position_id: Number(e.target.value) })}><option value="">Selecione</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Secundária"><select value={form.secondary_position_id} onChange={(e) => setForm({ ...form, secondary_position_id: e.target.value ? Number(e.target.value) : null })}><option value="">Nenhuma</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><div className="skills">{Object.keys(initialSkills).map((key) => <Field key={key} label={key.replace("knowledge_level", "Nível").replace("reception", "Recepção").replace("setting", "Levantamento").replace("blocking", "Bloqueio").replace("serving", "Saque").replace("attack", "Ataque").replace("defense", "Defesa")}><input type="number" min="0" max="10" value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} /></Field>)}</div><div className="actions"><Button>{editing ? "Atualizar" : "Cadastrar"}</Button>{editing && <Button type="button" tone="ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancelar</Button>}</div></form>
    <div><div className="section-heading"><h3>Jogadores</h3><span>{result.pagination?.total || 0} encontrados</span></div><div className="players-toolbar"><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar jogadores" />{search && <button className="icon-button" onClick={() => setSearch("")}>Limpar</button>}</div><Notice tone="error">{error}</Notice><div className="list">{result.items?.map((item) => <article className="list-item" key={item.id}><div><b>{item.name}</b><span>{item.primary_position}{item.secondary_position && ` / ${item.secondary_position}`}</span><small>{item.email} · {item.phone}</small></div><div className="actions"><span className={`membership-badge ${item.is_guest ? "guest" : "member"}`}>{item.is_guest ? "Convidado" : "Membro"}</span><span className="priority-badge">Prioridade {item.priority_level}</span><Badge status={item.active ? "confirmed" : "cancelled"} /><button className="icon-button" onClick={() => edit(item)}>Editar</button><button className="icon-button" onClick={async () => { await send(`/players/${item.id}/active`, "PATCH", { active: !item.active }); reload(); }}>{item.active ? "Inativar" : "Ativar"}</button></div></article>)}</div>{!result.items?.length && <Empty>Nenhum jogador encontrado.</Empty>}</div></div>;
}

function PlaceAdmin() {
  const [place, reload, error] = useLoad("/place", {});
  const save = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const updated = await send("/place", "PATCH", values);
    if (updated.slug !== PLACE_SLUG) window.location.assign(`/${updated.slug}`);
    else reload();
  };
  return <form className="card settings-card" key={JSON.stringify(place)} onSubmit={save}><h3>Local e endereço</h3><Notice tone="error">{error}</Notice><div className="form-row"><Field label="Nome do local"><input name="name" required defaultValue={place.name || ""} /></Field><Field label="Rota"><input name="slug" required defaultValue={place.slug || ""} placeholder="nilo" /></Field></div><Field label="Endereço"><input name="address" defaultValue={place.address || ""} placeholder="Rua, número e complemento" /></Field><div className="form-row"><Field label="Bairro"><input name="neighborhood" defaultValue={place.neighborhood || ""} /></Field><Field label="Cidade"><input name="city" defaultValue={place.city || ""} /></Field></div><div className="form-row"><Field label="Estado"><input name="state" maxLength="2" defaultValue={place.state || ""} /></Field><Field label="CEP"><input name="postal_code" defaultValue={place.postal_code || ""} /></Field></div><Field label="Link do mapa"><input name="maps_url" type="url" defaultValue={place.maps_url || ""} placeholder="https://maps.google.com/..." /></Field><Button>Salvar local</Button></form>;
}

function CatalogAdmin({ positions, reloadPositions }) {
  const [shifts, reloadShifts] = useLoad("/shifts?per_page=100", { items: [] });
  const [settings, reloadSettings] = useLoad("/settings", {});
  const [position, setPosition] = useState({ name: "", required_per_team: 1 }); const [shift, setShift] = useState({ name: "", starts_at: "19:00", ends_at: "22:00" });
  return <div className="catalog-grid"><section><div className="section-heading"><h3>Posições</h3><span>Composição por time</span></div><form className="inline-form" onSubmit={async (e) => { e.preventDefault(); await send("/positions", "POST", position); setPosition({ name: "", required_per_team: 1 }); reloadPositions(); }}><input placeholder="Nome" required value={position.name} onChange={(e) => setPosition({ ...position, name: e.target.value })} /><input aria-label="Quantidade" type="number" min="0" max="12" value={position.required_per_team} onChange={(e) => setPosition({ ...position, required_per_team: Number(e.target.value) })} /><Button>Adicionar</Button></form><div className="list">{positions.map((item) => <article className="list-item" key={item.id}><b>{item.name}</b><label className="quantity">por time <input type="number" min="0" max="12" defaultValue={item.required_per_team} onBlur={async (e) => { await send(`/positions/${item.id}`, "PATCH", { ...item, required_per_team: Number(e.target.value) }); reloadPositions(); }} /></label></article>)}</div></section>
    <section><div className="section-heading"><h3>Turnos</h3><span>Janelas de participação</span></div><form className="inline-form shift-form" onSubmit={async (e) => { e.preventDefault(); await send("/shifts", "POST", shift); setShift({ name: "", starts_at: "19:00", ends_at: "22:00" }); reloadShifts(); }}><input placeholder="Nome" required value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} /><input type="time" value={shift.starts_at} onChange={(e) => setShift({ ...shift, starts_at: e.target.value })} /><input type="time" value={shift.ends_at} onChange={(e) => setShift({ ...shift, ends_at: e.target.value })} /><Button>Adicionar</Button></form><div className="list">{shifts.items?.map((item) => <article className="list-item" key={item.id}><div><b>{item.name}</b><span>{item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)}</span></div><Badge status={item.active ? "confirmed" : "cancelled"} /></article>)}</div></section>
    <PlaceAdmin /><form className="card settings-card" key={JSON.stringify(settings)} onSubmit={async (e) => { e.preventDefault(); const values = new FormData(e.currentTarget); await send("/settings", "PATCH", { max_teams_per_event: Number(values.get("max_teams_per_event")), confirmation_deadline_days: Number(values.get("confirmation_deadline_days")), admin_whatsapp: values.get("admin_whatsapp"), imbalance_threshold: Number(values.get("imbalance_threshold")) }); reloadSettings(); }}><h3>Configurações gerais</h3><div className="form-row"><Field label="Máximo de times"><input name="max_teams_per_event" type="number" min="1" defaultValue={settings.max_teams_per_event ?? 3} /></Field><Field label="Prazo de confirmação (dias)"><input name="confirmation_deadline_days" type="number" min="0" defaultValue={settings.confirmation_deadline_days ?? 1} /></Field></div><div className="form-row"><Field label="WhatsApp dos administradores"><input name="admin_whatsapp" defaultValue={settings.admin_whatsapp || ""} placeholder="5511999999999" /></Field><Field label="Alerta de desequilíbrio"><input name="imbalance_threshold" type="number" step="0.1" min="0" defaultValue={settings.imbalance_threshold ?? 1.5} /></Field></div><Button>Salvar configurações</Button></form></div>;
}

function RegistrationEditor({ registration, positions, vacancies, onClose, onSaved }) {
  const [form, setForm] = useState({
    priority_level: registration.priority_level,
    primary_position_id: registration.primary_position_id,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedVacancy = vacancies.find((item) => (
    item.shift_id === registration.shift_id
    && item.position_id === Number(form.primary_position_id)
  ));
  const positionChanged = Number(form.primary_position_id) !== registration.primary_position_id;
  const positionFull = positionChanged && selectedVacancy && selectedVacancy.available <= 0;
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await send(`/registrations/${registration.id}`, "PATCH", {
        priority_level: Number(form.priority_level),
        primary_position_id: Number(form.primary_position_id),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="card registration-editor" onSubmit={save}>
      <div className="card-title"><span>Editar no evento</span><button type="button" className="icon-button" onClick={onClose}>Fechar</button></div>
      <div className="registration-editor-player"><b>{registration.player_name}</b><span>{registration.shift}</span></div>
      <Notice tone="error">{error}</Notice>
      <Field label="Prioridade neste evento"><select value={form.priority_level} onChange={(event) => setForm({ ...form, priority_level: Number(event.target.value) })}><option value="1">1 · Alta</option><option value="2">2 · Normal</option><option value="3">3 · Baixa</option></select></Field>
      <Field label="Posição em que irá jogar"><select value={form.primary_position_id} onChange={(event) => setForm({ ...form, primary_position_id: Number(event.target.value) })}>{positions.filter((item) => item.active && item.required_per_team > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.required_per_team} por time</option>)}</select></Field>
      {registration.assigned_position && <small className="assigned-position-note">Posição atual na formação: {registration.assigned_position}</small>}
      {positionFull && <Notice tone="error">Essa posição está sem vagas neste turno. Para salvar, troque primeiro a posição de outro jogador; o sistema não permite ultrapassar o limite.</Notice>}
      {!positionFull && positionChanged && selectedVacancy && <Notice>Restam {selectedVacancy.available} vaga(s) nessa posição antes da alteração.</Notice>}
      <div className="actions"><Button disabled={saving}>{saving ? "Salvando…" : "Salvar alteração"}</Button><Button type="button" tone="ghost" onClick={onClose}>Cancelar</Button></div>
    </form>
  </div>;
}

function EventsAdmin() {
  const [events, reload] = useLoad("/events?per_page=100", { items: [], recurrences: [] }); const [shifts] = useLoad("/shifts?public=true&per_page=100", { items: [] }); const [positions] = useLoad("/positions?active=true&per_page=100", { items: [] });
  const [form, setForm] = useState(() => ({ title: "Jogo de vôlei", game_date: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10), starts_at: "19:00", registration_opens_at: new Date(Date.now() - 3600000).toISOString(), team_count: 3, shift_ids: [], recurring: false, weekdays: [] }));
  const [selected, setSelected] = useState(null); const [detail, setDetail] = useState(null); const [editingRegistration, setEditingRegistration] = useState(null); const [error, setError] = useState("");
  const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const open = async (id) => { try { setDetail(await api(`/events/${id}`)); setSelected(id); } catch (err) { setError(err.message); } };
  const attendance = async (registration, status) => {
    const payload = { registration_id: registration.id, status, reason: status.includes("absence") ? prompt("Motivo da falta:") || "Não informado" : null, base_updated_at: registration.updated_at };
    if (!navigator.onLine) { queueOperation("attendance", payload); setDetail({ ...detail, registrations: detail.registrations.map((item) => item.id === registration.id ? { ...item, status } : item) }); return; }
    await send(`/registrations/${registration.id}/status`, "PATCH", payload); open(selected);
  };
  const updateNotes = async (registration) => { const notes = prompt("Observação:", registration.notes || ""); if (notes === null) return; const payload = { registration_id: registration.id, notes, base_updated_at: registration.updated_at }; if (!navigator.onLine) { queueOperation("notes", payload); setDetail({ ...detail, registrations: detail.registrations.map((item) => item.id === registration.id ? { ...item, notes } : item) }); } else { await send(`/registrations/${registration.id}/notes`, "PATCH", { notes }); open(selected); } };
  const removeEvent = async (scope) => { const recurring = scope === "recurrence"; if (!confirm(recurring ? "Remover todos os eventos desta recorrência? O histórico será preservado." : "Remover somente este evento? O histórico será preservado.")) return; try { await send(`/events/${selected}?scope=${scope}`, "DELETE"); setDetail(null); setSelected(null); reload(); } catch (err) { setError(err.message); } };
  const removeRecurrence = async (eventId) => { if (!confirm("Remover esta recorrência permanente? Os eventos e o histórico serão preservados como removidos.")) return; try { await send(`/events/${eventId}?scope=recurrence`, "DELETE"); reload(); } catch (err) { setError(err.message); } };
  return <div className="admin-grid"><form className="card sticky-form" onSubmit={async (e) => { e.preventDefault(); try { const payload = { ...form, start_date: form.game_date }; delete payload.recurring; await send(form.recurring ? "/events/recurring" : "/events", "POST", payload); reload(); setError(""); } catch (err) { setError(err.message); } }}><h3>Novo evento</h3><Notice tone="error">{error}</Notice><Field label="Título"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><div className="form-row"><Field label="Data inicial"><input type="date" value={form.game_date} onChange={(e) => setForm({ ...form, game_date: e.target.value })} /></Field><Field label="Horário"><input type="time" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field></div><Field label="Liberação das inscrições"><input type="datetime-local" value={form.registration_opens_at.slice(0, 16)} onChange={(e) => setForm({ ...form, registration_opens_at: new Date(e.target.value).toISOString() })} /></Field><Field label="Quantidade de times"><input type="number" min="1" max="12" value={form.team_count} onChange={(e) => setForm({ ...form, team_count: Number(e.target.value) })} /></Field><Field label="Turnos"><div className="checks">{shifts.items?.map((item) => <label key={item.id}><input type="checkbox" checked={form.shift_ids.includes(item.id)} onChange={(e) => setForm({ ...form, shift_ids: e.target.checked ? [...form.shift_ids, item.id] : form.shift_ids.filter((id) => id !== item.id) })} />{item.name}</label>)}</div></Field><label className="toggle"><input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Evento recorrente</label>{form.recurring && <><Field label="Repetir nos dias"><div className="checks">{dayLabels.map((day, index) => <label key={day}><input type="checkbox" checked={form.weekdays.includes(index)} onChange={(e) => setForm({ ...form, weekdays: e.target.checked ? [...form.weekdays, index] : form.weekdays.filter((value) => value !== index) })} />{day}</label>)}</div></Field><div className="recurrence-hint"><b>Recorrência permanente</b><span>Os eventos continuarão sendo programados automaticamente, sem data final, até você remover a recorrência.</span>{events.recurrences?.length > 0 && <small>{events.recurrences.length} outra(s) recorrência(s) ativa(s) neste local.</small>}</div></>}<Button disabled={!form.shift_ids.length || (form.recurring && !form.weekdays.length)}>{form.recurring ? "Criar recorrência" : "Criar evento"}</Button></form>
    <div>{detail ? <><button className="back" onClick={() => setDetail(null)}>← Voltar aos eventos</button><div className="section-heading"><div><h3>{detail.title}</h3><span>{fmtDate(detail.game_date)} · {detail.starts_at.slice(0, 5)}</span></div><div className="actions"><Button tone="ghost" onClick={() => removeEvent("single")}>Remover este evento</Button>{detail.recurrence_group && <Button tone="danger" onClick={() => removeEvent("recurrence")}>Remover recorrência</Button>}</div></div><div className="stats">{["confirmed", "pending_confirmation", "waitlist"].map((key) => <div key={key}><b>{detail.summary[key] || 0}</b><span>{STATUS[key]}</span></div>)}</div><div className="vacancies">{detail.vacancies?.map((item) => <span key={`${item.shift_id}-${item.position_id}`}>{item.shift} · {item.position}: <b>{item.available}</b></span>)}</div><div className="list registrations">{detail.registrations.map((item) => <article className="list-item" key={item.id}><div><b>{item.player_name}</b><span>{item.primary_position} · {item.shift} · {item.is_guest ? "Convidado" : "Membro"} · Prioridade {item.priority_level}</span><small>{item.notes || "Sem observação"}</small></div><div className="attendance"><Badge status={item.status} /><button onClick={() => setEditingRegistration(item)}>Editar</button><button onClick={() => updateNotes(item)}>Observação</button><button onClick={() => attendance(item, "present")}>Presente</button><button onClick={() => attendance(item, "justified_absence")}>Justificada</button><button onClick={() => attendance(item, "unjustified_absence")}>Injustificada</button></div></article>)}</div>{editingRegistration && <RegistrationEditor registration={editingRegistration} positions={positions.items || []} vacancies={detail.vacancies || []} onClose={() => setEditingRegistration(null)} onSaved={() => open(selected)} />}</> : <>{events.recurrences?.length > 0 && <section className="recurrences-panel"><div className="section-heading"><h3>Recorrências ativas</h3><span>Sem data final</span></div><div className="recurrence-cards">{events.recurrences.map((recurrence) => <article key={recurrence.recurrence_group}><div><b>{recurrence.title}</b><span>{recurrence.weekdays.map((day) => dayLabels[day]).join(", ")} · {recurrence.starts_at.slice(0, 5)}</span><small>Próximo evento: {fmtDate(recurrence.next_date)} · programada continuamente</small></div><button className="icon-button" onClick={() => removeRecurrence(recurrence.representative_event_id)}>Remover recorrência</button></article>)}</div></section>}<div className="section-heading"><h3>Eventos</h3><span>{events.pagination?.total || 0} agendados</span></div><div className="event-cards">{events.items?.map((item) => <button key={item.id} onClick={() => open(item.id)}><time><b>{String(new Date(`${item.game_date}T12:00`).getDate()).padStart(2, "0")}</b><span>{new Date(`${item.game_date}T12:00`).toLocaleDateString("pt-BR", { month: "short" })}</span></time><div><b>{item.title}</b><span>{item.starts_at.slice(0, 5)} · {item.shifts.map((shift) => shift.name).join(", ")}</span></div><Badge status={item.status} /></button>)}</div></>}</div></div>;
}

function BlacklistAdmin() {
  const [entries, reload] = useLoad("/blacklist?per_page=100", { items: [] }); const [players] = useLoad("/players?active=true&per_page=100", { items: [] }); const [form, setForm] = useState({ player_id: "", reason: "" });
  return <div><form className="card horizontal-card" onSubmit={async (e) => { e.preventDefault(); await send("/blacklist", "POST", { ...form, player_id: Number(form.player_id), origin: "manual" }); setForm({ player_id: "", reason: "" }); reload(); }}><Field label="Jogador"><select required value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value })}><option value="">Selecione</option>{players.items?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Motivo"><input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><Button>Adicionar bloqueio</Button></form><div className="section-heading"><h3>Histórico da Lista Negra</h3><span>Remoções preservam o registro</span></div><div className="list">{entries.items?.map((item) => <article className="list-item" key={item.id}><div><b>{item.player_name}</b><span>{item.reason}</span><small>{item.origin} · {new Date(item.included_at).toLocaleString("pt-BR")}</small></div><div className="actions"><Badge status={item.active ? "unjustified_absence" : "cancelled"} />{item.active && <button className="icon-button" onClick={async () => { await send(`/blacklist/${item.id}`, "DELETE", { reason: prompt("Motivo da remoção:") }); reload(); }}>Remover</button>}</div></article>)}</div></div>;
}

function TeamsAdmin() {
  const [events] = useLoad("/events?per_page=100", { items: [] }); const [eventId, setEventId] = useState(""); const event = events.items?.find((item) => item.id === Number(eventId)); const [shiftId, setShiftId] = useState(""); const [formation, setFormation] = useState(null); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  const load = async (generate = false) => { try { setFormation(await api(`/events/${eventId}/shifts/${shiftId}/formation`, generate ? { method: "POST" } : {})); setError(""); } catch (err) { setError(err.message); } };
  const drop = async (teamId, positionId, memberId) => { try { setFormation(await send(`/team-members/${memberId}`, "PATCH", { team_id: teamId, position_id: positionId })); } catch (err) { setError(err.message); } };
  const periodText = (periods = []) => (periods || []).filter(Boolean).map((period) => `${period.name} · ${period.starts_at.slice(0, 5)}–${period.ends_at.slice(0, 5)}`).join(" + ");
  return <div><div className="toolbar card"><Field label="Evento"><select value={eventId} onChange={(e) => { setEventId(e.target.value); setShiftId(""); setFormation(null); }}><option value="">Selecione</option>{events.items?.map((item) => <option key={item.id} value={item.id}>{fmtDate(item.game_date)} · {item.title}</option>)}</select></Field><Field label="Turno"><select value={shiftId} onChange={(e) => setShiftId(e.target.value)}><option value="">Selecione</option>{event?.shifts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Button disabled={!shiftId} onClick={() => load(true)}>Formar times</Button><Button tone="ghost" disabled={!shiftId} onClick={() => load(false)}>Atualizar</Button>{formation && <Button tone="dark" onClick={async () => { const { text } = await api(`/events/${eventId}/shifts/${shiftId}/whatsapp`); await navigator.clipboard.writeText(text); setCopied(true); }}>WhatsApp {copied ? "✓" : "↗"}</Button>}</div><Notice tone="error">{error}</Notice>
    {formation && <><div className="linked-periods"><b>Turnos interligados:</b><span>{periodText(formation.linked_shifts)}</span></div><div className="balance"><div><span>Diferença média</span><b>{formation.differences.overall}</b></div>{Object.entries(formation.differences).filter(([key]) => key !== "overall").map(([key, value]) => <div key={key}><span>{key}</span><b>{value}</b></div>)}</div><div className="teams-board">{formation.teams.map((team) => <section className="team-card" key={team.id}><header><div><span>#{team.number}</span><h3>{team.name}</h3></div><b>{team.metrics.overall}</b></header><div className="team-members" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const [memberId, positionId] = e.dataTransfer.getData("text/plain").split(":"); drop(team.id, Number(positionId), Number(memberId)); }}>{team.members.map((member) => <article draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", `${member.id}:${member.position_id}`)} key={member.id}><span className="drag">⠿</span><div><b>{member.registration.player_name}</b><small>{member.position} · {member.registration.overall}</small><small className="member-period">{periodText(member.registration.selected_periods)}</small></div><Badge status={member.registration.status} /></article>)}</div><div className="metric-bars">{Object.entries(team.metrics).filter(([key]) => key !== "overall").map(([key, value]) => <label key={key}><span>{key}</span><i><u style={{ width: `${value * 10}%` }} /></i><b>{value}</b></label>)}</div></section>)}</div>{formation.missing?.length > 0 && <div className="notice error"><b>Vagas não preenchidas:</b> {formation.missing.map((item) => `${item.team}: ${item.missing} ${item.position}`).join(" · ")}</div>}<section className="waitlist"><h3>Banco / lista de espera</h3>{formation.waitlist.length ? formation.waitlist.map((item) => <span key={item.id}>{item.player_name} · {item.primary_position} · {periodText(item.selected_periods)}</span>) : <Empty>Ninguém aguardando.</Empty>}</section></>}
  </div>;
}

function AdminLogin({ onSuccess }) {
  const [form, setForm] = useState({ email: "", password: "" }); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const login = async (e) => { e.preventDefault(); setLoading(true); try { const session = await send("/auth/login", "POST", form); localStorage.setItem("voleiflow_access_token", session.access_token); onSuccess(session); flushQueue(); } catch (err) { setError(err.message); } finally { setLoading(false); } };
  return <section className="admin-login"><form className="card" onSubmit={login}><span className="eyebrow">Acesso restrito</span><h1>Administração</h1><p>Entre com seu usuário administrador para gerenciar eventos e jogadores.</p><Notice tone="error">{error}</Notice><Field label="E-mail"><input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Senha"><input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Button disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button></form></section>;
}

function AdminPortal({ bootstrap, reloadBootstrap }) {
  const [admin, setAdmin] = useState(null); const [checking, setChecking] = useState(Boolean(localStorage.getItem("voleiflow_access_token")));
  useEffect(() => { const unauthorized = () => { localStorage.removeItem("voleiflow_access_token"); setAdmin(null); setChecking(false); }; window.addEventListener("voleiflow:unauthorized", unauthorized); if (localStorage.getItem("voleiflow_access_token")) api("/auth/me").then((data) => { setAdmin(data); setChecking(false); }).catch(unauthorized); return () => window.removeEventListener("voleiflow:unauthorized", unauthorized); }, []);
  if (checking) return <div className="loading-screen">Validando sessão…</div>;
  if (!admin) return <AdminLogin onSuccess={setAdmin} />;
  return <Admin bootstrap={bootstrap} reloadBootstrap={reloadBootstrap} admin={admin} onLogout={async () => { try { await send("/auth/logout", "POST", {}); } finally { localStorage.removeItem("voleiflow_access_token"); setAdmin(null); } }} />;
}

function Admin({ bootstrap, reloadBootstrap, admin, onLogout }) {
  const tabs = ["Eventos", "Jogadores", "Posições e turnos", "Lista Negra", "Formação de times"]; const [tab, setTab] = useState("Eventos");
  return <section className="admin-page"><div className="admin-heading"><div><span className="eyebrow">Central de controle</span><h2>Administração</h2></div><div className="admin-user"><div><b>{admin.name}</b><span>{admin.email}</span></div><Button tone="ghost" onClick={onLogout}>Sair</Button></div></div><nav className="subnav">{tabs.map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav>
    <div className="admin-content">{tab === "Eventos" && <EventsAdmin />}{tab === "Jogadores" && <PlayersAdmin positions={bootstrap.positions || []} />}{tab === "Posições e turnos" && <CatalogAdmin positions={bootstrap.positions || []} reloadPositions={reloadBootstrap} />}{tab === "Lista Negra" && <BlacklistAdmin />}{tab === "Formação de times" && <TeamsAdmin />}</div>
  </section>;
}

function Confirmation({ token, goHome }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => { api(`/registrations/confirm/${token}`).then((data) => setState({ loading: false, data, error: "" })).catch((err) => setState({ loading: false, data: null, error: err.message })); }, [token]);
  return <main className="confirmation"><div className="card"><div className="confirm-icon">{state.error ? "!" : "✓"}</div><h1>{state.loading ? "Confirmando…" : state.error ? "Não foi possível confirmar" : "Presença confirmada!"}</h1><p>{state.error || (state.data?.status === "waitlist" ? "Sua confirmação foi registrada e você está na lista de espera." : "Sua vaga ganhou prioridade. Nos vemos em quadra!")}</p><Button onClick={goHome}>Voltar ao início</Button></div></main>;
}

function PlacesLanding() {
  const [places, , error] = useLoad("/places", { items: [] });
  return <main className="places-page"><section className="places-hero gap-4 flex"><ThemedLogo alt="" /><span className="eyebrow">VoleiFlow</span><h1>Onde vamos jogar?</h1><p>Escolha o local para ver os próximos jogos, jogadores e inscrições.</p></section><Notice tone="error">{error}</Notice><div className="place-cards">{places.items?.map((place) => <a href={`/${place.slug}`} className="place-card" key={place.id}><div><span>Local</span><h2>{place.name}</h2><p>{place.address ? [place.address, place.neighborhood, place.city, place.state].filter(Boolean).join(" · ") : "Endereço em atualização"}</p></div><b>Acessar <span>→</span></b></a>)}</div>{!error && !places.items?.length && <Empty>Nenhum local disponível no momento.</Empty>}</main>;
}

function PlaceNotFound() {
  return <main className="not-found-page"><div className="card"><span className="not-found-code">404</span><h1>Local não encontrado</h1><p>Essa rota não corresponde a nenhum local ativo do VoleiFlow.</p><a className="button primary" href="/">Escolher um local</a></div></main>;
}

function App() {
  const [page, setPage] = useState("inscricao");
  const isPlacesHome = location.pathname === "/";
  const [bootstrap, reload, loadError] = useLoad(isPlacesHome ? null : "/public/bootstrap", { events: [], positions: [], players: { items: [] }, settings: {} });
  const token = useMemo(() => location.pathname.match(/^\/(?:[^/]+\/)?confirmar\/(.+)$/)?.[1], []);
  if (isPlacesHome) return <><ThemeToggle /><PlacesLanding /><AppFooter /></>;
  if (loadError === "Local não encontrado ou inativo.") return <><ThemeToggle /><PlaceNotFound /><AppFooter /></>;
  if (token) return <><ThemeToggle /><Confirmation token={token} goHome={() => { history.replaceState({}, "", PLACE_SLUG ? `/${PLACE_SLUG}` : "/nilo"); location.reload(); }} /><AppFooter /></>;
  return <><ThemeToggle /><header className="topbar"><button className="brand" onClick={() => setPage("inscricao")}><ThemedLogo alt="" /><span>Volei<b>Flow</b>{bootstrap.place?.name && <small>{bootstrap.place.name}</small>}</span></button><nav><button className={page === "inscricao" ? "active" : ""} onClick={() => setPage("inscricao")}>Inscrição</button><button className={page === "situacao" ? "active" : ""} onClick={() => setPage("situacao")}>Meus times</button><button className={page === "admin" ? "active" : ""} onClick={() => setPage("admin")}>Admin</button></nav><Connectivity /></header><main><Notice tone="error">{loadError}</Notice>{page === "inscricao" && <Signup bootstrap={bootstrap} reload={reload} />}{page === "situacao" && <Situation bootstrap={bootstrap} />}{page === "admin" && <AdminPortal bootstrap={bootstrap} reloadBootstrap={reload} />}</main><AppFooter place={bootstrap.place?.name} /></>;
}

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
const root = globalThis.__voleiflowRoot || createRoot(document.getElementById("root"));
globalThis.__voleiflowRoot = root;
root.render(<StrictMode><App /></StrictMode>);
