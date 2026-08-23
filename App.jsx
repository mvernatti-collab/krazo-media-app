import React, { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import {
  Radio, Video, Mic, Camera, Users, Clapperboard, CheckCircle2, Circle,
  PlusCircle, X, ChevronLeft, ChevronRight, Upload, Star, Calendar,
  Trash2, Link2, FileVideo, Image as ImageIcon, FileText, Megaphone,
  Settings, ExternalLink, Pencil, ListChecks, Download, Lock, LogOut, KeyRound
} from "lucide-react";
import { db } from "./firebase";
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion,
} from "firebase/firestore";

/* ---------------------------------------------------------
   KRAZO MEDIA — control room palette
   ink #EEF1F4 · panel #F6F7F9 · hairline #E2E5EA
   on-air #E8362E · standby #F2A93B · clear #3EC28F · signal #3E8EDE
--------------------------------------------------------- */

const ROLES = [
  "Producer/Switcher", "Main Camera", "Sideline Camera 1", "Sideline Camera 2",
  "Photographer", "Videographer", "Audio - Play by Play", "Audio - Analyst",
];
const VIDEO_BOARD_ROLE = "Video Board Operator";
const ALL_ROLES = [...ROLES, VIDEO_BOARD_ROLE];
const ROLE_NOTES = { "Producer/Switcher": "Student lead who runs switcher program" };

const STAGES = [
  { key: "requested", label: "Requested", color: "#8891A0", text: "#5B6472" },
  { key: "production", label: "In Production", color: "#F2A93B", text: "#A66A08" },
  { key: "review", label: "Review", color: "#3E8EDE", text: "#1D6FBD" },
  { key: "published", label: "Published", color: "#3EC28F", text: "#178A5E" },
];

const TYPE_ICON = {
  Video: FileVideo,
  Article: FileText,
  Graphic: ImageIcon,
  Promo: Megaphone,
};

// Sourced from ozarkmotigers.org varsity schedules, 2026-2027 season
const emptyRoles = {
  "Producer/Switcher": null, "Main Camera": null, "Sideline Camera 1": null, "Sideline Camera 2": null,
  Photographer: null, Videographer: null, "Audio - Play by Play": null, "Audio - Analyst": null,
  [VIDEO_BOARD_ROLE]: null,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASON_YEAR = 2026;

function parseStreamDate(dateStr) {
  const [mon, day] = dateStr.split(" ");
  return new Date(SEASON_YEAR, MONTHS.indexOf(mon), parseInt(day, 10));
}
function parseStreamDateTime(s) {
  const base = parseStreamDate(s.date).getTime();
  const m = s.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return base + 24 * 60 * 60000; // TBA sorts last within its day
  let h = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return base + (h * 60 + parseInt(m[2], 10)) * 60000;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function parseBool(val, fallback) {
  if (val === undefined || val === null || String(val).trim() === "") return fallback;
  const v = String(val).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return fallback;
}
function genPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function getRoleFills(stream, role) {
  const v = stream.roles ? stream.roles[role] : null;
  if (Array.isArray(v)) return v;
  if (v && v.name) return [v];
  return [];
}
function getRoleSlots(stream, role) {
  return (stream.roleSlots && stream.roleSlots[role]) || 1;
}

const SPECIAL_EVENT_SPORT = "Special Event";

const TABS = [
  { key: "live", label: "Stream Board", shortLabel: "Streams", icon: Camera },
  { key: "calendar", label: "Calendar", shortLabel: "Calendar", icon: Calendar },
  { key: "content", label: "Content Board", shortLabel: "Content", icon: Clapperboard },
  { key: "links", label: "Links", shortLabel: "Links", icon: ExternalLink },
];
const SPORT_ABBR = { Football: "FB", Volleyball: "VB", "Boys Soccer": "SOC", Softball: "SB", [SPECIAL_EVENT_SPORT]: "EVT" };
function sportAbbr(sportKey) {
  return SPORT_ABBR[sportKey] || sportKey.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}
const SPORT_ORDER = ["Football", "Volleyball", "Boys Soccer", "Softball"];
function sportOrderIndex(sportKey) {
  const i = SPORT_ORDER.indexOf(sportKey);
  return i === -1 ? 999 : i;
}
const SPORT_SUGGESTIONS = [...SPORT_ORDER, "Basketball (Boys)", "Basketball (Girls)", "Wrestling", "Swim & Dive", "Baseball", "Track & Field"];

const CATEGORY_COLORS = { livestream: "#ED1C24", content: "#14171C", special: "#7C3AED" };
const CATEGORY_LABELS = { livestream: "Livestream", content: "Content Only", special: "Special Event" };
function eventCategory(ev) {
  if (ev.sportKey === SPECIAL_EVENT_SPORT) return "special";
  return ev.openSignup ? "content" : "livestream";
}

const mk = (id, sportKey, opponent, site, date, time, opts = {}) => {
  const needsVideoBoard = opts.needsVideoBoard || false;
  return {
    id, title: `Varsity ${sportKey}`, sportKey, opponent, site, date, time,
    status: "upcoming", roles: { ...emptyRoles }, evaluations: [],
    openSignup: false, attendees: [], needsVideoBoard, includeInBoard: true,
    openRoles: needsVideoBoard ? ALL_ROLES : ROLES,
    roleSlots: Object.fromEntries(ALL_ROLES.map((r) => [r, 1])),
    ...opts,
  };
};

const initialStreams = [
  // Football
  mk("fb1", "Football", "vs Kickapoo/Nixa (Jamboree)", "Home", "Aug 21", "7:00 PM", { openSignup: true }),
  mk("fb2", "Football", "vs Neosho", "Home", "Aug 28", "7:00 PM", { needsVideoBoard: true }),
  mk("fb4", "Football", "vs Webb City", "Home", "Sep 11", "7:00 PM", { needsVideoBoard: true }),
  mk("fb6", "Football", "vs Nixa", "Home", "Sep 25", "7:00 PM", { needsVideoBoard: true }),
  mk("fb8", "Football", "vs Lebanon (Senior Night)", "Home", "Oct 9", "7:00 PM", { needsVideoBoard: true }),
  mk("fb9", "Football", "vs Glendale (Homecoming)", "Home", "Oct 16", "7:00 PM", { needsVideoBoard: true }),
  // Volleyball
  mk("vb1", "Volleyball", "vs Jefferson City (Youth Night)", "Home", "Aug 27", "7:00 PM"),
  mk("vb2", "Volleyball", "vs Liberty North", "Home", "Aug 28", "4:00 PM"),
  mk("vb7", "Volleyball", "vs Webb City", "Home", "Sep 15", "7:30 PM"),
  mk("vb10", "Volleyball", "vs Neosho (Women's Cancer Awareness Night)", "Home", "Sep 22", "7:30 PM"),
  mk("vb12", "Volleyball", "vs Joplin", "Home", "Sep 29", "7:30 PM"),
  mk("vb13", "Volleyball", "vs Waynesville (Senior Night)", "Home", "Oct 1", "7:30 PM"),
  mk("vb15", "Volleyball", "vs Nixa", "Home", "Oct 6", "7:30 PM"),
  mk("vb17", "Volleyball", "vs Grand Slam Tournament", "Home", "Oct 9", "TBA"),
  mk("vb18", "Volleyball", "vs Grand Slam Tournament", "Home", "Oct 10", "TBA"),
  mk("vb19", "Volleyball", "vs Lebanon (Teacher Appreciation Night)", "Home", "Oct 13", "7:30 PM"),
  // Boys Soccer
  mk("soc1", "Boys Soccer", "vs Capital City", "Home", "Aug 27", "6:45 PM"),
  mk("soc3", "Boys Soccer", "vs Helias Catholic", "Home", "Sep 3", "6:30 PM"),
  mk("soc8", "Boys Soccer", "vs Chaminade College Prep", "Home", "Sep 17", "6:30 PM"),
  mk("soc9", "Boys Soccer", "vs Willard", "Home", "Sep 22", "6:30 PM"),
  mk("soc11", "Boys Soccer", "vs Springfield Catholic", "Home", "Sep 28", "6:30 PM"),
  mk("soc12", "Boys Soccer", "vs Neosho", "Home", "Sep 29", "6:30 PM"),
  mk("soc16", "Boys Soccer", "vs Republic", "Home", "Oct 6", "6:30 PM"),
  mk("soc20", "Boys Soccer", "vs Kickapoo", "Home", "Oct 13", "6:30 PM"),
  mk("soc23", "Boys Soccer", "vs Rockhurst", "Home", "Oct 17", "12:00 PM"),
  mk("soc24", "Boys Soccer", "vs Glendale", "Home", "Oct 19", "6:30 PM"),
  // Softball
  mk("sb1", "Softball", "vs Helias Catholic", "Home", "Aug 27", "4:00 PM"),
  mk("sb5", "Softball", "vs Owasso", "Home", "Sep 3", "5:00 PM"),
  mk("sb8", "Softball", "vs Carthage", "Home", "Sep 8", "5:00 PM"),
  mk("sb10", "Softball", "vs Ozark's Fall Festival", "Home", "Sep 11", "TBA"),
  mk("sb11", "Softball", "vs Ozark's Fall Festival", "Home", "Sep 12", "TBA"),
  mk("sb13", "Softball", "vs Joplin", "Home", "Sep 15", "5:00 PM"),
  mk("sb17", "Softball", "vs Webb City (Women's Cancer Awareness Night)", "Home", "Sep 22", "5:00 PM"),
  mk("sb18", "Softball", "vs Kickapoo", "Home", "Sep 24", "5:00 PM"),
  mk("sb21", "Softball", "vs Logan-Rogersville", "Home", "Sep 30", "5:00 PM"),
  mk("sb22", "Softball", "vs Glendale (Senior Night)", "Home", "Oct 1", "5:00 PM"),
  mk("sb24", "Softball", "vs Marshfield (Teacher Appreciation Night)", "Home", "Oct 7", "5:00 PM"),
];

const initialJobs = [
  { id: "j1", title: "Season Hype Trailer", type: "Promo", stage: "requested", assignee: "Sam R.", due: "Aug 12", link: "" },
  { id: "j2", title: "Semifinal Highlight Reel", type: "Video", stage: "production", assignee: "Josh T.", due: "Aug 11", link: "" },
  { id: "j3", title: "Roster Spotlight — #12", type: "Graphic", stage: "production", assignee: "Kayla P.", due: "Aug 13", link: "" },
  { id: "j4", title: "Post-Game Recap Article", type: "Article", stage: "review", assignee: "Dre W.", due: "Aug 9", link: "" },
  { id: "j5", title: "Showcase Recap Video", type: "Video", stage: "published", assignee: "Nate G.", due: "Aug 4", link: "https://drive.google.com/krazo/showcase-recap" },
];

const initialLinks = [
  { id: "l1", title: "Ozark Tigers Athletics", url: "https://www.ozarkmotigers.org", note: "Official schedules & rosters" },
  { id: "l2", title: "MSHSAA", url: "https://www.mshsaa.org", note: "State schedules, rules, brackets" },
  { id: "l3", title: "Hudl", url: "https://www.hudl.com", note: "Production truck / live broadcast" },
  { id: "l4", title: "RepMore Sports", url: "https://www.repmoresports.com", note: "Press Row Gridiron overlay graphics" },
];

const initialRoster = [];

function TallyDot({ color, pulse, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
      </span>
      {label && (
        <span className="text-[10px] tracking-[0.15em] uppercase font-medium" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>
          {label}
        </span>
      )}
    </span>
  );
}

function statusMeta(status) {
  if (status === "live") return { color: "#E8362E", text: "#C42B22", label: "On Air", pulse: true };
  if (status === "upcoming") return { color: "#3E8EDE", text: "#1D6FBD", label: "Scheduled", pulse: false };
  return { color: "#5B6472", text: "#5B6472", label: "Wrapped", pulse: false };
}

function StreamCard({ stream, expanded, onToggle, onClaim, onRelease, onSubmitEval, onAddAttendee, onRemoveAttendee, roster = [], studentIdentity, accessLevel, onRequireSignIn }) {
  const meta = statusMeta(stream.status);
  const [rating, setRating] = useState({ video: 0, audio: 0, commentary: 0, overall: 0 });
  const [notes, setNotes] = useState("");

  const roleList = Array.isArray(stream.openRoles)
    ? stream.openRoles
    : (stream.needsVideoBoard ? [...ROLES, VIDEO_BOARD_ROLE] : ROLES);
  const totalSlots = roleList.reduce((sum, r) => sum + getRoleSlots(stream, r), 0);
  const filledCount = roleList.reduce((sum, r) => sum + getRoleFills(stream, r).length, 0);
  const isOpenCall = stream.openSignup;
  const dotColor = isOpenCall ? "#F2A93B" : meta.color;
  const labelColor = isOpenCall ? "#A66A08" : meta.text;
  const statusLabel = isOpenCall ? "Open Call" : meta.label;

  const claimRoleSlot = (role) => {
    if (!studentIdentity) { onRequireSignIn(); return; }
    onClaim(stream.id, role, studentIdentity.name, studentIdentity.email);
  };

  const canRemove = (name) => accessLevel === "admin" || (studentIdentity && studentIdentity.name === name);

  const joinOpenCall = () => {
    if (!studentIdentity) { onRequireSignIn(); return; }
    if (stream.attendees.some((a) => a.name === studentIdentity.name)) return;
    onAddAttendee(stream.id, { name: studentIdentity.name, email: studentIdentity.email });
  };

  const removeAttendee = (name) => {
    onRemoveAttendee(stream.id, name);
  };

  const submitEvaluation = () => {
    if (!studentIdentity) { onRequireSignIn(); return; }
    onSubmitEval(stream.id, { evaluator: studentIdentity.name, ...rating, notes });
    setNotes("");
    setRating({ video: 0, audio: 0, commentary: 0, overall: 0 });
  };

  return (
    <div
      className="rounded-md border overflow-hidden transition-colors"
      style={{ backgroundColor: "#F6F7F9", borderColor: expanded ? meta.color + "66" : "#E2E5EA" }}
    >
      <button onClick={onToggle} className="w-full text-left px-4 py-3.5 flex items-center gap-4">
        <TallyDot color={dotColor} pulse={meta.pulse && !isOpenCall} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3
              className="text-[15px] font-semibold uppercase tracking-wide text-[#14171C] truncate"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {stream.title}
            </h3>
            <span className="text-xs text-[#14171C]">{stream.opponent}</span>
            {isOpenCall && (
              <span
                className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                style={{ color: "#A66A08", backgroundColor: "#F2A93B22", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Not Streamed
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="flex items-center gap-1"><Calendar size={11} />{stream.date} · {stream.time}</span>
            <span>{stream.sport}</span>
            {isOpenCall ? (
              <span className="flex items-center gap-1"><Users size={11} />{stream.attendees.length} signed up</span>
            ) : (
              <span className="flex items-center gap-1"><Users size={11} />{filledCount}/{totalSlots} filled</span>
            )}
          </div>
        </div>
        <span className="text-[10px] tracking-widest uppercase font-medium" style={{ color: labelColor, fontFamily: "'IBM Plex Mono', monospace" }}>
          {statusLabel}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "#E2E5EA" }}>
          {isOpenCall ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#14171C] mb-1" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Open Camera Night — Sign Up
              </div>
              <p className="text-xs text-[#6B7280] mb-3">
                No broadcast this night — I'd like everyone available to sign up. I'll have cameras there to get content and get familiar with them. We have one week before our first home game.
              </p>
              {studentIdentity && stream.attendees.some((a) => a.name === studentIdentity.name) ? (
                <p className="text-xs text-[#178A5E]">You're signed up, {studentIdentity.name}.</p>
              ) : (
                <button
                  onClick={joinOpenCall}
                  className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                  style={{ backgroundColor: "#F2A93B22", color: "#A66A08", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {studentIdentity ? "I'm In" : "Sign In to Join"}
                </button>
              )}

              {stream.attendees.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    Signed Up ({stream.attendees.length})
                  </div>
                  {stream.attendees.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: "#E2E5EA" }}>
                      <span className="text-sm text-[#14171C]">{a.name}</span>
                      {canRemove(a.name) && (
                        <button onClick={() => removeAttendee(a.name)} className="text-[#6B7280] hover:text-[#E8362E]">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#14171C] mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              Crew Sign-Up
            </div>
            {roleList.length === 0 ? (
              <p className="text-xs text-[#6B7280]">No positions have been opened for this event yet.</p>
            ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {roleList.map((role) => {
                const fills = getRoleFills(stream, role);
                const slots = getRoleSlots(stream, role);
                const full = fills.length >= slots;
                const alreadyIn = studentIdentity && fills.some((p) => p.name === studentIdentity.name);
                return (
                  <div
                    key={role}
                    className="rounded border px-2.5 py-2 flex flex-col gap-1"
                    style={{ borderColor: "#E2E5EA", backgroundColor: "#EEF1F4" }}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {role} {slots > 1 && <span className="text-[#6B7280]">({fills.length}/{slots})</span>}
                    </span>
                    {ROLE_NOTES[role] && (
                      <span className="text-[10px] text-[#6B7280] -mt-1">{ROLE_NOTES[role]}</span>
                    )}
                    {fills.map((p) => (
                      <div key={p.name} className="flex items-center justify-between gap-1">
                        <span className="text-sm text-[#14171C] truncate">{p.name}</span>
                        {canRemove(p.name) && (
                          <button onClick={() => onRelease(stream.id, role, p.name)} className="text-[#14171C] hover:text-[#E8362E] shrink-0">
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!full && !alreadyIn && (
                      <button
                        onClick={() => claimRoleSlot(role)}
                        className="text-sm text-[#1D6FBD] hover:text-[#125A99] text-left flex items-center gap-1"
                      >
                        <Circle size={12} /> {studentIdentity ? "Open — claim" : "Sign in to claim"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
          )}

          {stream.status === "complete" && !isOpenCall && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#14171C] mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Post-Stream Evaluation
              </div>

              {stream.evaluations.length > 0 && (
                <div className="space-y-2 mb-3">
                  {stream.evaluations.map((ev, i) => (
                    <div key={i} className="rounded border px-3 py-2" style={{ borderColor: "#E2E5EA", backgroundColor: "#EEF1F4" }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#14171C] font-medium">{ev.evaluator}</span>
                        <span className="text-xs text-[#178A5E]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                          avg {((ev.video + ev.audio + ev.commentary + ev.overall) / 4).toFixed(1)}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1 text-[11px] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        <span>Video {ev.video}</span>
                        <span>Audio {ev.audio}</span>
                        <span>Commentary {ev.commentary}</span>
                        <span>Overall {ev.overall}</span>
                      </div>
                      {ev.notes && <p className="text-xs text-[#14171C] mt-1.5">{ev.notes}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#EEF1F4" }}>
                <p className="text-xs text-[#14171C]">
                  {studentIdentity ? `Evaluating as ${studentIdentity.name}` : "Sign in to leave an evaluation."}
                </p>
                {["video", "audio", "commentary", "overall"].map((cat) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {cat}
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setRating((r) => ({ ...r, [cat]: n }))}>
                          <Star size={15} fill={rating[cat] >= n ? "#F2A93B" : "none"} color={rating[cat] >= n ? "#F2A93B" : "#6B7280"} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes..."
                  rows={2}
                  className="w-full bg-transparent border rounded text-sm text-[#14171C] placeholder-[#6B7280] outline-none p-2 resize-none"
                  style={{ borderColor: "#E2E5EA" }}
                />
                <button
                  onClick={submitEvaluation}
                  className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                  style={{ backgroundColor: "#3EC28F22", color: "#178A5E", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {studentIdentity ? "Submit Evaluation" : "Sign In to Evaluate"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, onMove, onDelete, onLinkChange, onPickUp, onKick, studentIdentity, accessLevel, onRequireSignIn }) {
  const stageIdx = STAGES.findIndex((s) => s.key === job.stage);
  const Icon = TYPE_ICON[job.type] || FileVideo;
  const showLoad = job.stage === "review" || job.stage === "published";
  const assignees = Array.isArray(job.assignees) ? job.assignees : (job.assignee ? [{ name: job.assignee }] : []);
  const alreadyOn = studentIdentity && assignees.some((a) => a.name === studentIdentity.name);
  const canKick = (name) => accessLevel === "admin" || (studentIdentity && studentIdentity.name === name);

  const pickUp = () => {
    if (!studentIdentity) { onRequireSignIn(); return; }
    if (alreadyOn) return;
    onPickUp(job.id, studentIdentity.name);
  };

  return (
    <div className="rounded-md border px-3 py-3 space-y-2" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icon size={14} className="mt-0.5 shrink-0 text-[#14171C]" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-[#14171C] leading-tight block">{job.title}</span>
            {job.createdBy && (
              <span className="text-[10px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                posted by {job.createdBy}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(job.id)} className="text-[#14171C] hover:text-[#E8362E] shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        {assignees.map((a) => (
          <span key={a.name} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EEF1F4] border border-[#E2E5EA]">
            {a.name}
            {canKick(a.name) && (
              <button onClick={() => onKick(job.id, a.name)} className="text-[#6B7280] hover:text-[#E8362E]">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {!alreadyOn && (
          <button
            onClick={pickUp}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
            style={{ borderColor: "#1D6FBD", color: "#1D6FBD" }}
          >
            <Circle size={10} /> {studentIdentity ? "Pick up this job" : "Sign in to pick up"}
          </button>
        )}
        <span className="ml-auto">Due {job.due}</span>
      </div>

      {showLoad && (
        <div className="flex items-center gap-1.5 pt-1">
          <Link2 size={12} className="text-[#14171C] shrink-0" />
          <input
            value={job.link}
            onChange={(e) => onLinkChange(job.id, e.target.value)}
            placeholder="Paste upload / drive link..."
            className="w-full bg-transparent border-b text-[11px] text-[#1D6FBD] placeholder-[#6B7280] outline-none pb-0.5"
            style={{ borderColor: "#E2E5EA", fontFamily: "'IBM Plex Mono', monospace" }}
          />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          disabled={stageIdx === 0}
          onClick={() => onMove(job.id, -1)}
          className="disabled:opacity-20 text-[#14171C] hover:text-[#14171C]"
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
          style={{ color: STAGES[stageIdx].text, backgroundColor: STAGES[stageIdx].color + "22", fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {STAGES[stageIdx].label}
        </span>
        <button
          disabled={stageIdx === STAGES.length - 1}
          onClick={() => onMove(job.id, 1)}
          className="disabled:opacity-20 text-[#14171C] hover:text-[#14171C]"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function AddJobModal({ onClose, onAdd, studentIdentity }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Video");
  const [due, setDue] = useState("");

  const submit = () => {
    if (!title.trim() || !studentIdentity) return;
    onAdd({
      id: "j" + Date.now(), title: title.trim(), type, stage: "requested",
      assignees: [], due: due || "TBD", link: "", createdBy: studentIdentity.name,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-md border p-5 space-y-3" style={{ backgroundColor: "#F6F7F9", borderColor: "#E2E5EA" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-[#14171C]" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Post New Job
          </h3>
          <button onClick={onClose} className="text-[#14171C] hover:text-[#14171C]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[#6B7280]">
          {studentIdentity ? `Posting as ${studentIdentity.name}` : "You need to be signed in to post a job."}
        </p>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title"
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
          style={{ borderColor: "#E2E5EA" }}
        />
        <select
          value={type} onChange={(e) => setType(e.target.value)}
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] outline-none"
          style={{ borderColor: "#E2E5EA" }}
        >
          {Object.keys(TYPE_ICON).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={due} onChange={(e) => setDue(e.target.value)} placeholder="Due date (e.g. Aug 20)"
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
          style={{ borderColor: "#E2E5EA" }}
        />
        <button
          onClick={submit}
          disabled={!studentIdentity}
          className="w-full text-xs uppercase tracking-wide font-medium py-2 rounded disabled:opacity-40"
          style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Add to Requested
        </button>
      </div>
    </div>
  );
}

function CalendarView({ streams, onSelectStream }) {
  const [viewMonth, setViewMonth] = useState(() => new Date(SEASON_YEAR, 7, 1)); // Aug 2026
  const [selectedDay, setSelectedDay] = useState(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOn = (date) =>
    streams
      .filter((s) => sameDay(parseStreamDate(s.date), date))
      .sort((a, b) => parseStreamDateTime(a) - parseStreamDateTime(b));

  const monthLabel = viewMonth.toLocaleDateString([], { month: "long", year: "numeric" });
  const today = new Date();

  const goMonth = (dir) => {
    setViewMonth(new Date(year, month + dir, 1));
    setSelectedDay(null);
  };

  const selectedEvents = selectedDay ? eventsOn(selectedDay) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          Season Calendar
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1 text-[10px] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[key] }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#6B7280" }} /> Solid = Home
        </span>
        <span className="flex items-center gap-1 text-[10px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          <span className="h-2 w-2 rounded-sm" style={{ border: "1px solid #6B7280" }} /> Outline = Away
        </span>
      </div>

      <div className="rounded-md border overflow-hidden" style={{ borderColor: "#E2E5EA" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
          <button onClick={() => goMonth(-1)} className="text-[#14171C] hover:text-[#1D6FBD]">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold uppercase tracking-wide text-[#14171C]" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {monthLabel}
          </span>
          <button onClick={() => goMonth(1)} className="text-[#14171C] hover:text-[#1D6FBD]">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[9px] uppercase tracking-wide text-[#6B7280] py-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: "#F6F7F9" }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: "#E2E5EA" }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="min-h-[62px] sm:min-h-[76px]" style={{ backgroundColor: "#FAFBFC" }} />;
            const dayEvents = eventsOn(date);
            const isSelected = selectedDay && sameDay(selectedDay, date);
            const isToday = sameDay(date, today);
            return (
              <button
                key={i}
                onClick={() => dayEvents.length > 0 && setSelectedDay(isSelected ? null : date)}
                disabled={dayEvents.length === 0}
                className="min-h-[62px] sm:min-h-[76px] p-1 flex flex-col items-start gap-0.5 text-left disabled:cursor-default"
                style={{ backgroundColor: isSelected ? "#EEF1F4" : "#FFFFFF" }}
              >
                <span
                  className="text-[10px] px-1 rounded"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: isToday ? "#FFFFFF" : "#14171C",
                    backgroundColor: isToday ? "#14171C" : "transparent",
                  }}
                >
                  {date.getDate()}
                </span>
                {dayEvents.slice(0, 3).map((ev) => {
                  const c = CATEGORY_COLORS[eventCategory(ev)];
                  const isHome = ev.site === "Home";
                  return (
                    <span
                      key={ev.id}
                      className="text-[8px] sm:text-[9px] uppercase tracking-wide px-1 rounded truncate w-full"
                      style={
                        isHome
                          ? { color: "#FFFFFF", backgroundColor: c, fontFamily: "'IBM Plex Mono', monospace" }
                          : { color: c, backgroundColor: "transparent", border: `1px solid ${c}`, fontFamily: "'IBM Plex Mono', monospace" }
                      }
                    >
                      {sportAbbr(ev.sportKey)}
                    </span>
                  );
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[8px] text-[#6B7280]">+{dayEvents.length - 3} more</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="mt-3 rounded-md border px-4 py-3 space-y-2" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {selectedDay.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </div>
          {selectedEvents.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onSelectStream(ev.id)}
              className="w-full flex items-center justify-between gap-3 rounded border px-3 py-2 text-left"
              style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF" }}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#14171C] truncate">{ev.title}</div>
                <div className="text-xs text-[#6B7280] truncate">{ev.opponent}</div>
              </div>
              <span className="text-[11px] text-[#6B7280] shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                {ev.time}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LinksView({ links, onAdd, onDelete, studentIdentity, onRequireSignIn }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");

  const openForm = () => {
    if (!studentIdentity) { onRequireSignIn(); return; }
    setShowForm((v) => !v);
  };

  const submit = () => {
    if (!title.trim() || !url.trim() || !studentIdentity) return;
    const fullUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    onAdd({ id: "l" + Date.now(), title: title.trim(), url: fullUrl, note: note.trim(), createdBy: studentIdentity.name });
    setTitle(""); setUrl(""); setNote(""); setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
          Important Links
        </h2>
        <button
          onClick={openForm}
          className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
          style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
        >
          <PlusCircle size={13} /> Add Link
        </button>
      </div>

      {showForm && (
        <div className="rounded-md border px-3 py-3 space-y-2 mb-4" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
          <p className="text-xs text-[#6B7280]">Posting as {studentIdentity && studentIdentity.name}</p>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Link title"
            className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
            style={{ borderColor: "#E2E5EA" }}
          />
          <input
            value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (e.g. hudl.com)"
            className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
            style={{ borderColor: "#E2E5EA" }}
          />
          <input
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note (optional)"
            className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
            style={{ borderColor: "#E2E5EA" }}
          />
          <button
            onClick={submit}
            className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
            style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Save Link
          </button>
        </div>
      )}

      <div className="space-y-2">
        {links.map((l) => (
          <div
            key={l.id}
            className="rounded-md border px-4 py-3 flex items-center justify-between gap-3"
            style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}
          >
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 min-w-0 group">
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-[#1D6FBD]" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#14171C] group-hover:text-[#1D6FBD] truncate">{l.title}</div>
                {l.note && <div className="text-xs text-[#6B7280] truncate">{l.note}</div>}
                {l.createdBy && (
                  <div className="text-[10px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    added by {l.createdBy}
                  </div>
                )}
              </div>
            </a>
            <button onClick={() => onDelete(l.id)} className="text-[#6B7280] hover:text-[#C42B22] shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {links.length === 0 && (
          <div className="rounded border border-dashed px-3 py-6 text-center text-xs text-[#6B7280]" style={{ borderColor: "#E2E5EA" }}>
            No links yet.
          </div>
        )}
      </div>
    </div>
  );
}

function emptyEventForm() {
  return {
    category: "sport", sportKey: "", customTitle: "", opponent: "", site: "Home",
    date: "", time: "", kind: "broadcast", openRoles: [...ROLES],
    roleSlots: Object.fromEntries(ALL_ROLES.map((r) => [r, 1])),
    includeInBoard: true, status: "upcoming",
  };
}

function AdminPanel({
  streams, onAdd, onUpdate, onDelete, onClose, passcodes, onUpdatePasscodes,
  roster, onAddRosterEntry, onAddRosterEntries, onDeleteRosterEntry,
  reminderHours, onUpdateReminderHours,
}) {
  const [adminTab, setAdminTab] = useState("schedule");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyEventForm());
  const [uploadSummary, setUploadSummary] = useState(null);
  const [studentCode, setStudentCode] = useState(passcodes.student);
  const [adminCode, setAdminCode] = useState(passcodes.admin);
  const [codesSaved, setCodesSaved] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [rosterUploadSummary, setRosterUploadSummary] = useState(null);
  const [reminderInput, setReminderInput] = useState(String(reminderHours));
  const [reminderSaved, setReminderSaved] = useState(false);
  const fileInputRef = useRef(null);
  const rosterFileInputRef = useRef(null);
  const modalScrollRef = useRef(null);

  const saveCodes = () => {
    if (!studentCode.trim() || !adminCode.trim()) return;
    onUpdatePasscodes({ student: studentCode.trim(), admin: adminCode.trim() });
    setCodesSaved(true);
    setTimeout(() => setCodesSaved(false), 2000);
  };

  const addStudent = () => {
    if (!studentName.trim() || !studentEmail.trim()) return;
    onAddRosterEntry({ id: "st" + Date.now(), name: studentName.trim(), email: studentEmail.trim(), pin: genPin() });
    setStudentName("");
    setStudentEmail("");
  };

  const regeneratePin = (r) => onAddRosterEntry({ ...r, pin: genPin() });

  const downloadRosterTemplate = () => {
    const csv = ["name,email,pin", "Mia Fields,mia.fields@example.com,1234", "Josh Turner,josh.turner@example.com,"].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "krazo-roster-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRosterCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let added = 0, skipped = 0;
        const entries = [];
        results.data.forEach((row) => {
          const name = (row.name || "").trim();
          const email = (row.email || "").trim();
          const pin = (row.pin || "").trim() || genPin();
          if (!name || !email) { skipped++; return; }
          entries.push({ id: "st" + Date.now() + Math.random().toString(36).slice(2, 7), name, email, pin });
          added++;
        });
        onAddRosterEntries(entries);
        setRosterUploadSummary({ added, skipped });
        if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
      },
    });
  };

  const saveReminderHours = () => {
    const n = parseInt(reminderInput, 10);
    if (isNaN(n) || n <= 0) return;
    onUpdateReminderHours(n);
    setReminderSaved(true);
    setTimeout(() => setReminderSaved(false), 2000);
  };

  const now = new Date();
  const reminderWindowMs = reminderHours * 60 * 60 * 1000;
  const upcomingForReminder = streams
    .filter((s) => s.includeInBoard)
    .map((s) => ({ s, at: parseStreamDateTime(s) }))
    .filter(({ at }) => at > now.getTime() && at - now.getTime() <= reminderWindowMs)
    .sort((a, b) => a.at - b.at);

  const recipientsFor = (s) => {
    const emails = new Set();
    Object.values(s.roles || {}).forEach((r) => { if (r && r.email) emails.add(r.email); });
    (s.attendees || []).forEach((a) => { if (a.email) emails.add(a.email); });
    return Array.from(emails);
  };

  const sortedStreams = [...streams].sort((a, b) => parseStreamDateTime(a) - parseStreamDateTime(b));

  const effectiveRoles = (s) =>
    Array.isArray(s.openRoles) ? s.openRoles : (s.needsVideoBoard ? ALL_ROLES : ROLES);

  const awayWithOpenPositions = streams.filter(
    (s) => s.site === "Away" && s.sportKey !== SPECIAL_EVENT_SPORT && !s.openSignup && effectiveRoles(s).length > 0
  );
  const fixAwayBroadcasts = () => {
    if (awayWithOpenPositions.length === 0) return;
    if (!window.confirm(`Clear open crew positions on ${awayWithOpenPositions.length} away game(s)? Crew sign-up stays available on each — this just starts them at zero open positions instead of the full list. You can open specific positions back up per event any time.`)) return;
    awayWithOpenPositions.forEach((s) => onUpdate(s.id, { openRoles: [], needsVideoBoard: false }));
  };

  const downloadTemplate = () => {
    const csv = [
      "category,sport,title,opponent,site,date,time,kind,needsvideoboard,includeinboard",
      "sport,Football,,vs Neosho,Home,Aug 28,7:00 PM,broadcast,true,true",
      "sport,Volleyball,,at Willard,Away,Sep 10,7:30 PM,broadcast,false,false",
      "special,,Meet the Tigers,Fall festival at the stadium,Home,Aug 15,5:00 PM,content,false,true",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "krazo-schedule-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let added = 0, skipped = 0;
        results.data.forEach((row) => {
          const category = (row.category || "sport").trim().toLowerCase();
          const site = (row.site || "Home").trim().toLowerCase() === "away" ? "Away" : "Home";
          const date = (row.date || "").trim();
          const time = (row.time || "").trim() || "TBA";
          const kind = (row.kind || "broadcast").trim().toLowerCase() === "content" ? "content" : "broadcast";
          const needsVideoBoard = parseBool(row.needsvideoboard, false);
          const includeInBoard = parseBool(row.includeinboard, site === "Home");

          if (!date) { skipped++; return; }

          let sportKey, title, opponent;
          if (category === "special") {
            title = (row.title || "").trim();
            opponent = (row.opponent || "").trim();
            if (!title) { skipped++; return; }
            sportKey = SPECIAL_EVENT_SPORT;
          } else {
            sportKey = (row.sport || "").trim();
            opponent = (row.opponent || "").trim();
            if (!sportKey || !opponent) { skipped++; return; }
            title = `Varsity ${sportKey}`;
          }

          onAdd({
            id: "ev" + Date.now() + Math.random().toString(36).slice(2, 7),
            sportKey, title, opponent, site, date, time,
            openSignup: kind === "content",
            needsVideoBoard, openRoles: needsVideoBoard ? ALL_ROLES : ROLES, includeInBoard,
            status: "upcoming", roles: { ...emptyRoles }, evaluations: [], attendees: [],
          });
          added++;
        });
        setUploadSummary({ added, skipped });
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    const isSpecial = s.sportKey === SPECIAL_EVENT_SPORT;
    setForm({
      category: isSpecial ? "special" : "sport",
      sportKey: isSpecial ? "" : s.sportKey,
      customTitle: isSpecial ? s.title : "",
      opponent: s.opponent, site: s.site, date: s.date, time: s.time,
      kind: s.openSignup ? "content" : "broadcast",
      openRoles: Array.isArray(s.openRoles)
        ? s.openRoles
        : (s.needsVideoBoard ? ALL_ROLES : ROLES),
      roleSlots: s.roleSlots || Object.fromEntries(ALL_ROLES.map((r) => [r, 1])),
      includeInBoard: s.includeInBoard !== false,
      status: s.status || "upcoming",
    });
    if (modalScrollRef.current) modalScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setRoleSlotCount = (role, n) => {
    setForm((f) => ({ ...f, roleSlots: { ...f.roleSlots, [role]: Math.max(1, n) } }));
  };

  const toggleFormRole = (role) => {
    setForm((f) => ({
      ...f,
      openRoles: f.openRoles.includes(role) ? f.openRoles.filter((r) => r !== role) : [...f.openRoles, role],
    }));
  };

  const resetForm = () => { setEditingId(null); setForm(emptyEventForm()); };

  const setSite = (site) => {
    // New events: Home defaults to included + full crew; Away defaults to excluded + no positions.
    // Editing an existing event never auto-resets these — only the person editing chooses to change them.
    setForm((f) => ({
      ...f,
      site,
      includeInBoard: editingId ? f.includeInBoard : site === "Home",
      openRoles: editingId ? f.openRoles : (site === "Home" ? [...ROLES] : []),
    }));
  };

  const submit = () => {
    const isSpecial = form.category === "special";
    if (isSpecial) {
      if (!form.customTitle.trim() || !form.date.trim()) return;
    } else {
      if (!form.sportKey.trim() || !form.opponent.trim() || !form.date.trim()) return;
    }
    const payload = isSpecial
      ? {
          sportKey: SPECIAL_EVENT_SPORT,
          title: form.customTitle.trim(),
          opponent: form.opponent.trim(),
          site: form.site,
          date: form.date.trim(),
          time: form.time.trim() || "TBA",
          openSignup: form.kind === "content",
          openRoles: form.openRoles,
          roleSlots: form.roleSlots,
          needsVideoBoard: form.openRoles.includes(VIDEO_BOARD_ROLE),
          includeInBoard: form.includeInBoard,
          status: form.status,
        }
      : {
          sportKey: form.sportKey.trim(),
          title: `Varsity ${form.sportKey.trim()}`,
          opponent: form.opponent.trim(),
          site: form.site,
          date: form.date.trim(),
          time: form.time.trim() || "TBA",
          openSignup: form.kind === "content",
          openRoles: form.openRoles,
          roleSlots: form.roleSlots,
          needsVideoBoard: form.openRoles.includes(VIDEO_BOARD_ROLE),
          includeInBoard: form.includeInBoard,
          status: form.status,
        };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd({
        id: "ev" + Date.now(),
        ...payload,
        roles: { ...emptyRoles },
        evaluations: [],
        attendees: [],
      });
    }
    resetForm();
  };

  return (
    <div ref={modalScrollRef} className="fixed inset-0 z-50 bg-black/40 overflow-y-auto px-4 py-6" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto rounded-md border"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E5EA" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 rounded-t-md" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-[#14171C]" />
            <h3 className="text-sm uppercase tracking-wide font-semibold text-[#14171C]" style={{ fontFamily: "'Oswald', sans-serif" }}>
              Admin
            </h3>
          </div>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#14171C]"><X size={16} /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b overflow-x-auto" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
          {[
            { key: "schedule", label: "Schedule" },
            { key: "roster", label: `Roster (${roster.length})` },
            { key: "reminders", label: "Reminders" },
            { key: "security", label: "Security" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setAdminTab(t.key)}
              className="text-[10px] uppercase tracking-wide font-medium px-3 py-2 rounded-t whitespace-nowrap"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                color: adminTab === t.key ? "#14171C" : "#6B7280",
                borderBottom: adminTab === t.key ? "2px solid #E8362E" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">
          {adminTab === "schedule" && (
            <>
          {awayWithOpenPositions.length > 0 && (
            <div className="rounded border px-3 py-3 space-y-2" style={{ borderColor: "#ED1C24", backgroundColor: "#ED1C2411" }}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#ED1C24]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Quick Fix
              </div>
              <p className="text-[11px] text-[#14171C]">
                {awayWithOpenPositions.length} away game{awayWithOpenPositions.length === 1 ? " has" : "s have"} open crew positions students can sign up for, even though nothing's actually being covered. Clear them to zero — sign-up stays available on each, you'll just need to manually open the specific positions you actually want covered.
              </p>
              <button
                onClick={fixAwayBroadcasts}
                className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                style={{ backgroundColor: "#ED1C24", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                Clear Positions on All {awayWithOpenPositions.length}
              </button>
            </div>
          )}

          {/* Bulk CSV import */}
          <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              Bulk Import (CSV)
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Columns: category (sport/special), sport, title, opponent, site (Home/Away), date, time, kind (broadcast/content), needsvideoboard, includeinboard.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium px-3 py-1.5 rounded border"
                style={{ borderColor: "#E2E5EA", color: "#14171C", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <Download size={12} /> Download Template
              </button>
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                style={{ backgroundColor: "#1D6FBD", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <Upload size={12} /> Upload CSV
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
            </div>
            {uploadSummary && (
              <p className="text-[11px]" style={{ color: uploadSummary.skipped > 0 ? "#A66A08" : "#178A5E" }}>
                Added {uploadSummary.added} event{uploadSummary.added === 1 ? "" : "s"}.
                {uploadSummary.skipped > 0 && ` Skipped ${uploadSummary.skipped} row${uploadSummary.skipped === 1 ? "" : "s"} (missing required fields).`}
              </p>
            )}
          </div>

          {/* Entry form */}
          <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {editingId ? "Edit Event" : "Add Event"}
            </div>

            <div className="flex gap-1.5">
              {[{ key: "sport", label: "Sporting Event" }, { key: "special", label: "Special Event" }].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, category: opt.key }))}
                  className="flex-1 text-[10px] uppercase tracking-wide px-2 py-1.5 rounded border"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: form.category === opt.key ? "#FFFFFF" : "#14171C",
                    backgroundColor: form.category === opt.key ? "#14171C" : "#EEF1F4",
                    borderColor: form.category === opt.key ? "#14171C" : "#E2E5EA",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.category === "sport" ? (
              <>
                <input
                  list="sport-suggestions"
                  value={form.sportKey}
                  onChange={(e) => setForm((f) => ({ ...f, sportKey: e.target.value }))}
                  placeholder="Sport (e.g. Football)"
                  className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                  style={{ borderColor: "#E2E5EA" }}
                />
                <datalist id="sport-suggestions">
                  {SPORT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                </datalist>
                <input
                  value={form.opponent}
                  onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
                  placeholder="Opponent (e.g. vs Neosho or at Willard)"
                  className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                  style={{ borderColor: "#E2E5EA" }}
                />
              </>
            ) : (
              <>
                <input
                  value={form.customTitle}
                  onChange={(e) => setForm((f) => ({ ...f, customTitle: e.target.value }))}
                  placeholder="Event name (e.g. Meet the Tigers)"
                  className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                  style={{ borderColor: "#E2E5EA" }}
                />
                <input
                  value={form.opponent}
                  onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
                  placeholder="Description (optional, e.g. Fall festival at the stadium)"
                  className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                  style={{ borderColor: "#E2E5EA" }}
                />
              </>
            )}

            <div className="grid grid-cols-3 gap-2">
              <select
                value={form.site}
                onChange={(e) => setSite(e.target.value)}
                className="bg-[#EEF1F4] border rounded px-2 py-2 text-sm text-[#14171C] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              >
                <option value="Home">Home</option>
                <option value="Away">Away</option>
              </select>
              <input
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                placeholder="Aug 21"
                className="bg-[#EEF1F4] border rounded px-2 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              />
              <input
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                placeholder="7:00 PM"
                className="bg-[#EEF1F4] border rounded px-2 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              />
            </div>

            <div className="rounded border px-2.5 py-2" style={{ borderColor: "#1D6FBD", backgroundColor: "#1D6FBD11" }}>
              <label className="flex items-center gap-2 text-xs font-medium text-[#14171C]">
                <input
                  type="checkbox" checked={form.includeInBoard}
                  onChange={(e) => setForm((f) => ({ ...f, includeInBoard: e.target.checked }))}
                />
                Include on Stream / Content Board
              </label>
              <p className="text-[10px] text-[#6B7280] mt-1 pl-6">
                Every event shows on the Calendar regardless. Home games default to included; Away games default to excluded. This checkbox is always editable, on new events and existing ones — flip it any time to add or remove an event from the board.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[10px] uppercase tracking-wide text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Sign-Up Type
              </span>
              <label className="flex items-center gap-2 text-xs text-[#14171C]">
                <input
                  type="radio" name="kind" checked={form.kind === "broadcast"}
                  onChange={() => setForm((f) => ({ ...f, kind: "broadcast" }))}
                />
                Crew role sign-up (specific positions, listed below)
              </label>
              <label className="flex items-center gap-2 text-xs text-[#14171C]">
                <input
                  type="radio" name="kind" checked={form.kind === "content"}
                  onChange={() => setForm((f) => ({ ...f, kind: "content" }))}
                />
                Open call sign-up (anyone adds their own name — no fixed positions)
              </label>
            </div>

            {form.kind === "broadcast" && (
              <div className="rounded border px-2.5 py-2" style={{ borderColor: "#E2E5EA", backgroundColor: "#EEF1F4" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    Open Positions for This Event ({form.openRoles.length} of {ALL_ROLES.length} open)
                  </span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm((f) => ({ ...f, openRoles: [...ALL_ROLES] }))} className="text-[10px] text-[#1D6FBD]">All</button>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, openRoles: [] }))} className="text-[10px] text-[#6B7280]">None</button>
                  </div>
                </div>
                <p className="text-[10px] text-[#6B7280] mb-1.5">
                  Uncheck everything to keep sign-up available but show zero open positions until you add specific ones — handy for away games you only sometimes cover.
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {ALL_ROLES.map((role) => (
                    <div key={role} className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-[#14171C]">
                        <input
                          type="checkbox"
                          checked={form.openRoles.includes(role)}
                          onChange={() => toggleFormRole(role)}
                        />
                        {role}
                      </label>
                      {form.openRoles.includes(role) && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>slots</span>
                          <button type="button" onClick={() => setRoleSlotCount(role, (form.roleSlots[role] || 1) - 1)} className="text-[#6B7280] hover:text-[#14171C] px-1">–</button>
                          <span className="text-xs text-[#14171C] w-4 text-center">{form.roleSlots[role] || 1}</span>
                          <button type="button" onClick={() => setRoleSlotCount(role, (form.roleSlots[role] || 1) + 1)} className="text-[#6B7280] hover:text-[#14171C] px-1">+</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded border px-2.5 py-2" style={{ borderColor: "#E2E5EA", backgroundColor: "#EEF1F4" }}>
              <span className="text-[10px] uppercase tracking-wide text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Status</span>
              <div className="flex gap-1.5 mt-1.5">
                {[{ key: "upcoming", label: "Upcoming" }, { key: "live", label: "Live" }, { key: "complete", label: "Completed" }].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, status: opt.key }))}
                    className="flex-1 text-[10px] uppercase tracking-wide px-2 py-1.5 rounded border"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: form.status === opt.key ? "#FFFFFF" : "#14171C",
                      backgroundColor: form.status === opt.key ? "#14171C" : "#FFFFFF",
                      borderColor: form.status === opt.key ? "#14171C" : "#E2E5EA",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={submit}
                className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {editingId ? "Save Changes" : "Add to Schedule"}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded border"
                  style={{ borderColor: "#E2E5EA", color: "#6B7280", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Existing events list */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280] mb-2 flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              <ListChecks size={12} /> All Events ({sortedStreams.length})
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {sortedStreams.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2" style={{ borderColor: "#E2E5EA" }}>
                  <div className="min-w-0">
                    <div className="text-sm text-[#14171C] truncate">{s.title} <span className="text-[#6B7280]">{s.opponent}</span></div>
                    <div className="text-[11px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                      {s.date} · {s.time} · {s.site}{s.openSignup ? " · Open Call" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                      style={
                        s.includeInBoard
                          ? { color: "#178A5E", backgroundColor: "#3EC28F22", fontFamily: "'IBM Plex Mono', monospace" }
                          : { color: "#6B7280", backgroundColor: "#E2E5EA", fontFamily: "'IBM Plex Mono', monospace" }
                      }
                    >
                      {s.includeInBoard ? "On Board" : "Calendar Only"}
                    </span>
                    <button onClick={() => startEdit(s)} className="text-[#6B7280] hover:text-[#1D6FBD]"><Pencil size={14} /></button>
                    <button onClick={() => onDelete(s.id)} className="text-[#6B7280] hover:text-[#C42B22]"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
            </>
          )}

          {adminTab === "roster" && (
          <>
          {/* Roster */}
          <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280] flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              <Users size={12} /> Student Roster ({roster.length})
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Add students here so their names autocomplete with email pre-filled during sign-up. Not required — anyone can still type their own name and email directly on a sign-up.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Name"
                className="bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              />
              <input
                value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} placeholder="Email"
                className="bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              />
            </div>
            <button
              onClick={addStudent}
              className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
              style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              Add Student
            </button>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={downloadRosterTemplate}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium px-3 py-1.5 rounded border"
                style={{ borderColor: "#E2E5EA", color: "#14171C", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <Download size={12} /> Template
              </button>
              <button
                onClick={() => rosterFileInputRef.current && rosterFileInputRef.current.click()}
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                style={{ backgroundColor: "#1D6FBD", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <Upload size={12} /> Upload CSV
              </button>
              <input ref={rosterFileInputRef} type="file" accept=".csv" onChange={handleRosterCSVUpload} className="hidden" />
            </div>
            {rosterUploadSummary && (
              <p className="text-[11px]" style={{ color: rosterUploadSummary.skipped > 0 ? "#A66A08" : "#178A5E" }}>
                Added {rosterUploadSummary.added} student{rosterUploadSummary.added === 1 ? "" : "s"}.
                {rosterUploadSummary.skipped > 0 && ` Skipped ${rosterUploadSummary.skipped} row${rosterUploadSummary.skipped === 1 ? "" : "s"} (missing name or email).`}
              </p>
            )}

            {roster.length > 0 && (
              <div className="space-y-1.5 pt-1 max-h-56 overflow-y-auto">
                {roster.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1.5" style={{ borderColor: "#E2E5EA" }}>
                    <div className="min-w-0">
                      <div className="text-sm text-[#14171C]">{r.name}</div>
                      <div className="text-[11px] text-[#6B7280]">{r.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ backgroundColor: "#EEF1F4", color: "#14171C", fontFamily: "'IBM Plex Mono', monospace" }}
                        title="Sign-in PIN"
                      >
                        {r.pin || "----"}
                      </span>
                      <button onClick={() => regeneratePin(r)} title="Generate a new PIN" className="text-[#6B7280] hover:text-[#1D6FBD]"><KeyRound size={13} /></button>
                      <button
                        onClick={() => { if (window.confirm(`Remove ${r.name} from the roster? They'll no longer be able to sign in with their PIN.`)) onDeleteRosterEntry(r.id); }}
                        className="text-[#6B7280] hover:text-[#C42B22]"
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {adminTab === "reminders" && (
          <>
          {/* Reminders */}
          <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280] flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              <Calendar size={12} /> Reminders
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Preview only for now — actual email sending needs the backend we're setting up next (Firebase + a scheduled job). Once that's live, this setting controls how far ahead reminders go out to anyone with an email on file for that event.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#14171C]">Send reminders</span>
              <input
                type="number" min="1" value={reminderInput}
                onChange={(e) => setReminderInput(e.target.value)}
                className="w-16 bg-[#EEF1F4] border rounded px-2 py-1.5 text-sm text-[#14171C] outline-none"
                style={{ borderColor: "#E2E5EA" }}
              />
              <span className="text-xs text-[#14171C]">hours before each event</span>
              <button
                onClick={saveReminderHours}
                className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                style={{ backgroundColor: "#1D6FBD", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {reminderSaved ? "Saved ✓" : "Save"}
              </button>
            </div>

            <div className="pt-1">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280] mb-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Would Trigger Right Now ({upcomingForReminder.length})
              </div>
              {upcomingForReminder.length === 0 ? (
                <p className="text-[11px] text-[#6B7280]">No board events currently fall inside the reminder window.</p>
              ) : (
                <div className="space-y-1.5">
                  {upcomingForReminder.map(({ s }) => {
                    const recipients = recipientsFor(s);
                    return (
                      <div key={s.id} className="rounded border px-3 py-2" style={{ borderColor: "#E2E5EA" }}>
                        <div className="text-sm text-[#14171C]">{s.title} <span className="text-[#6B7280]">{s.opponent}</span></div>
                        <div className="text-[11px] text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                          {s.date} · {s.time} · {recipients.length} email{recipients.length === 1 ? "" : "s"} on file
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {adminTab === "security" && (
          <>
          {/* Security */}
          <div className="rounded border px-3 py-3 space-y-2.5" style={{ borderColor: "#E2E5EA", backgroundColor: "#F6F7F9" }}>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#6B7280] flex items-center gap-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              <KeyRound size={12} /> Access Codes
            </div>
            <p className="text-[11px] text-[#6B7280]">
              Change these periodically. Students use their code for sign-ups; the admin code also unlocks this panel. Everyone currently signed in stays signed in until they tap the lock icon.
            </p>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Student Code</span>
              <input
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] outline-none mt-1"
                style={{ borderColor: "#E2E5EA" }}
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Admin Code</span>
              <input
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] outline-none mt-1"
                style={{ borderColor: "#E2E5EA" }}
              />
            </label>
            <button
              onClick={saveCodes}
              className="text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
              style={{ backgroundColor: "#1D6FBD", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {codesSaved ? "Saved ✓" : "Save Codes"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function PasscodeGate({ passcodes, onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    if (v.toLowerCase() === passcodes.admin.toLowerCase()) { onUnlock("admin"); return; }
    if (v.toLowerCase() === passcodes.student.toLowerCase()) { onUnlock("student"); return; }
    setError(true);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ backgroundColor: "#FFFFFF" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { font-family: 'Inter', sans-serif; }
      `}</style>
      <div className="w-full max-w-sm rounded-md border px-6 py-8 text-center" style={{ borderColor: "#E2E5EA" }}>
        <div className="h-10 w-10 rounded flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: "#E8362E" }}>
          <Radio size={20} color="#FFFFFF" />
        </div>
        <h1 className="text-lg font-bold uppercase tracking-wider text-[#14171C]" style={{ fontFamily: "'Oswald', sans-serif" }}>
          Krazo Media
        </h1>
        <p className="text-xs text-[#6B7280] mb-5">Enter your access code to continue</p>
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Access code"
          autoFocus
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2.5 text-sm text-[#14171C] text-center outline-none mb-3"
          style={{ borderColor: error ? "#E8362E" : "#E2E5EA" }}
        />
        {error && <p className="text-xs text-[#C42B22] mb-3">That code doesn't match. Check with your producer.</p>}
        <button
          onClick={submit}
          className="w-full text-xs uppercase tracking-wide font-medium py-2.5 rounded"
          style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Enter
        </button>
      </div>
    </div>
  );
}

function StudentSignInModal({ roster, onSignIn, onClose }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    const match = roster.find(
      (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase() && r.pin && r.pin === pin.trim()
    );
    if (!match) { setError(true); return; }
    onSignIn(match);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-md border p-5 space-y-3"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E5EA" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-[#14171C]" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Sign In
          </h3>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#14171C]"><X size={16} /></button>
        </div>
        <p className="text-xs text-[#6B7280]">
          Sign in with your name and PIN to sign up for positions, post jobs, add links, or leave an evaluation. Ask your producer if you don't have a PIN yet.
        </p>
        <input
          list="roster-names-signin"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(false); }}
          placeholder="Your name"
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2 text-sm text-[#14171C] placeholder-[#6B7280] outline-none"
          style={{ borderColor: "#E2E5EA" }}
        />
        <datalist id="roster-names-signin">
          {roster.map((r) => <option key={r.id} value={r.name} />)}
        </datalist>
        <input
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(false); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="4-digit PIN"
          inputMode="numeric"
          className="w-full bg-[#EEF1F4] border rounded px-3 py-2.5 text-sm text-[#14171C] placeholder-[#6B7280] outline-none text-center tracking-[0.4em]"
          style={{ borderColor: error ? "#E8362E" : "#E2E5EA" }}
        />
        {error && <p className="text-xs text-[#C42B22]">That name/PIN combo didn't match. Check with your producer.</p>}
        <button
          onClick={submit}
          className="w-full text-xs uppercase tracking-wide font-medium py-2.5 rounded"
          style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Sign In
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [accessLevel, setAccessLevel] = useState(null); // null | 'student' | 'admin'
  const [studentIdentity, setStudentIdentity] = useState(null); // null | {id, name, email}
  const [showSignIn, setShowSignIn] = useState(false);
  const [passcodes, setPasscodesLocal] = useState({ student: "TIGERS2026", admin: "KRAZOADMIN" });
  const [reminderHours, setReminderHoursLocal] = useState(24);
  const [tab, setTab] = useState("live");
  const [streams, setStreams] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [links, setLinks] = useState([]);
  const [roster, setRoster] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddJob, setShowAddJob] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [sortBy, setSortBy] = useState("date"); // 'date' | 'sport'
  const [sportFilter, setSportFilter] = useState("All");
  const [showCompleted, setShowCompleted] = useState(false);
  const [jobSortBy, setJobSortBy] = useState("due"); // 'due' | 'title'
  const [calendarStreamId, setCalendarStreamId] = useState(null);

  const requireSignIn = () => setShowSignIn(true);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // One-time seed: if the streams collection is empty (fresh Firebase project),
  // populate it with the starting schedule/jobs/links so the app isn't blank.
  useEffect(() => {
    (async () => {
      const streamsSnap = await getDocs(collection(db, "streams"));
      if (streamsSnap.empty) {
        const batch = writeBatch(db);
        initialStreams.forEach((s) => batch.set(doc(db, "streams", s.id), s));
        initialJobs.forEach((j) => batch.set(doc(db, "jobs", j.id), j));
        initialLinks.forEach((l) => batch.set(doc(db, "links", l.id), l));
        await batch.commit();
      }
      const settingsSnap = await getDoc(doc(db, "settings", "app"));
      if (!settingsSnap.exists()) {
        await setDoc(doc(db, "settings", "app"), {
          passcodes: { student: "TIGERS2026", admin: "KRAZOADMIN" },
          reminderHours: 24,
        });
      }
      setDataReady(true);
    })();
  }, []);

  // Live sync: every device reading these listeners sees the same data within ~1s of a change.
  useEffect(() => {
    if (!dataReady) return;
    const unsubs = [
      onSnapshot(collection(db, "streams"), (snap) => setStreams(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "jobs"), (snap) => setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "links"), (snap) => setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "roster"), (snap) => setRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(doc(db, "settings", "app"), (d) => {
        if (!d.exists()) return;
        const data = d.data();
        if (data.passcodes) setPasscodesLocal(data.passcodes);
        if (typeof data.reminderHours === "number") setReminderHoursLocal(data.reminderHours);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [dataReady]);

  if (!dataReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ backgroundColor: "#FFFFFF" }}>
        <p className="text-sm text-[#6B7280]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Loading Krazo Media…</p>
      </div>
    );
  }

  if (!accessLevel) {
    return <PasscodeGate passcodes={passcodes} onUnlock={setAccessLevel} />;
  }

  const boardStreams = streams.filter((s) => s.includeInBoard);
  const activeBoardStreams = boardStreams.filter((s) => s.status !== "complete");
  const completedBoardStreams = boardStreams.filter((s) => s.status === "complete");
  const visibleStreams = showCompleted ? completedBoardStreams : activeBoardStreams;

  const presentSports = Array.from(new Set(visibleStreams.map((s) => s.sportKey))).sort(
    (a, b) => sportOrderIndex(a) - sportOrderIndex(b) || a.localeCompare(b)
  );
  const SPORT_FILTERS = ["All", ...presentSports];

  const displayedStreams = visibleStreams
    .filter((s) => sportFilter === "All" || s.sportKey === sportFilter)
    .slice()
    .sort((a, b) => {
      if (sortBy === "sport") {
        const diff = sportOrderIndex(a.sportKey) - sportOrderIndex(b.sportKey);
        if (diff !== 0) return diff;
      }
      return parseStreamDateTime(a) - parseStreamDateTime(b);
    });

  const claimRole = (streamId, role, name, email) => {
    const stream = streams.find((s) => s.id === streamId);
    if (!stream) return;
    const current = getRoleFills(stream, role);
    const slots = getRoleSlots(stream, role);
    if (current.length >= slots || current.some((p) => p.name === name)) return;
    updateDoc(doc(db, "streams", streamId), { [`roles.${role}`]: [...current, { name, email }] });
  };

  const releaseRole = (streamId, role, name) => {
    const stream = streams.find((s) => s.id === streamId);
    if (!stream) return;
    const current = getRoleFills(stream, role).filter((p) => p.name !== name);
    updateDoc(doc(db, "streams", streamId), { [`roles.${role}`]: current });
  };

  const submitEval = (streamId, ev) =>
    updateDoc(doc(db, "streams", streamId), { evaluations: arrayUnion(ev) });

  const addAttendee = (streamId, attendee) =>
    updateDoc(doc(db, "streams", streamId), { attendees: arrayUnion(attendee) });

  const removeAttendee = (streamId, name) => {
    const stream = streams.find((s) => s.id === streamId);
    if (!stream) return;
    const current = (stream.attendees || []).filter((a) => a.name !== name);
    updateDoc(doc(db, "streams", streamId), { attendees: current });
  };

  const addStream = (stream) => setDoc(doc(db, "streams", stream.id), stream);
  const updateStream = (id, patch) => updateDoc(doc(db, "streams", id), patch);
  const deleteStream = (id) => deleteDoc(doc(db, "streams", id));

  const addLink = (link) => setDoc(doc(db, "links", link.id), link);
  const deleteLink = (id) => deleteDoc(doc(db, "links", id));

  const addRosterEntry = (entry) => setDoc(doc(db, "roster", entry.id), entry);
  const addRosterEntries = async (entries) => {
    const batch = writeBatch(db);
    entries.forEach((e) => batch.set(doc(db, "roster", e.id), e));
    await batch.commit();
  };
  const deleteRosterEntry = (id) => deleteDoc(doc(db, "roster", id));

  const moveJob = (id, dir) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const idx = STAGES.findIndex((s) => s.key === job.stage);
    const next = Math.min(Math.max(idx + dir, 0), STAGES.length - 1);
    updateDoc(doc(db, "jobs", id), { stage: STAGES[next].key });
  };

  const deleteJob = (id) => deleteDoc(doc(db, "jobs", id));
  const linkChange = (id, link) => updateDoc(doc(db, "jobs", id), { link });
  const addJob = (job) => setDoc(doc(db, "jobs", job.id), job);

  const pickUpJob = (id, name) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const current = Array.isArray(job.assignees) ? job.assignees : (job.assignee ? [{ name: job.assignee }] : []);
    if (current.some((a) => a.name === name)) return;
    updateDoc(doc(db, "jobs", id), { assignees: [...current, { name }], assignee: "" });
  };

  const kickFromJob = (id, name) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const current = Array.isArray(job.assignees) ? job.assignees : (job.assignee ? [{ name: job.assignee }] : []);
    updateDoc(doc(db, "jobs", id), { assignees: current.filter((a) => a.name !== name), assignee: "" });
  };

  const setPasscodes = (newPasscodes) => setDoc(doc(db, "settings", "app"), { passcodes: newPasscodes }, { merge: true });
  const setReminderHours = (n) => setDoc(doc(db, "settings", "app"), { reminderHours: n }, { merge: true });

  const liveCount = streams.filter((s) => s.status === "live").length;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "#FFFFFF" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* Header */}
      <div className="border-b sticky top-0 z-30" style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFFee", backdropFilter: "blur(6px)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded flex items-center justify-center" style={{ backgroundColor: "#E8362E" }}>
              <Radio size={16} color="#FFFFFF" />
            </div>
            <div>
              <h1 className="text-base font-bold uppercase tracking-wider text-[#14171C] leading-none" style={{ fontFamily: "'Oswald', sans-serif" }}>
                Krazo Media
              </h1>
              <span className="text-[10px] text-[#14171C] tracking-wide">Ozark Tigers Production Desk</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
              {liveCount > 0 && <TallyDot color="#C42B22" pulse label={`${liveCount} ON AIR`} />}
              <span className="ml-2">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </div>
            {studentIdentity ? (
              <button
                onClick={() => setStudentIdentity(null)}
                title="Sign out"
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium px-2.5 py-1.5 rounded border"
                style={{ borderColor: "#178A5E", color: "#178A5E", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <CheckCircle2 size={13} /> <span className="hidden sm:inline">{studentIdentity.name}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowSignIn(true)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium px-2.5 py-1.5 rounded border"
                style={{ borderColor: "#1D6FBD", color: "#1D6FBD", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <KeyRound size={13} /> <span className="hidden sm:inline">Sign In</span>
              </button>
            )}
            {accessLevel === "admin" && (
              <button
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium px-2.5 py-1.5 rounded border"
                style={{ borderColor: "#E2E5EA", color: "#14171C", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                <Settings size={13} /> <span className="hidden sm:inline">Admin</span>
              </button>
            )}
            <button
              onClick={() => { setAccessLevel(null); setStudentIdentity(null); }}
              title="Lock / switch access code"
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium px-2.5 py-1.5 rounded border"
              style={{ borderColor: "#E2E5EA", color: "#6B7280", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              <Lock size={13} />
            </button>
          </div>
        </div>

        {/* Tab / tally switcher — desktop only, mobile uses the bottom nav bar */}
        <div className="hidden sm:flex max-w-5xl mx-auto px-4 sm:px-6 gap-1 pb-2">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-t text-xs uppercase tracking-wide font-medium transition-colors"
                style={{
                  color: active ? "#14171C" : "#14171C",
                  backgroundColor: active ? "#F6F7F9" : "transparent",
                  borderTop: active ? "2px solid #E8362E" : "2px solid transparent",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                <Icon size={13} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {tab === "live" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-y-2">
              <div className="flex items-center gap-1.5">
                {[{ key: false, label: `Active (${activeBoardStreams.length})` }, { key: true, label: `Completed (${completedBoardStreams.length})` }].map((opt) => (
                  <button
                    key={String(opt.key)}
                    onClick={() => setShowCompleted(opt.key)}
                    className="text-[10px] uppercase tracking-wide px-2.5 py-1.5 rounded border"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: showCompleted === opt.key ? "#FFFFFF" : "#14171C",
                      backgroundColor: showCompleted === opt.key ? "#14171C" : "#F6F7F9",
                      borderColor: showCompleted === opt.key ? "#14171C" : "#E2E5EA",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#6B7280] mr-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    Sort
                  </span>
                  {[{ key: "date", label: "Date" }, { key: "sport", label: "Sport" }].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setSortBy(opt.key)}
                      className="text-[10px] uppercase tracking-wide px-2 py-1 rounded border"
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: sortBy === opt.key ? "#FFFFFF" : "#14171C",
                        backgroundColor: sortBy === opt.key ? "#14171C" : "#F6F7F9",
                        borderColor: sortBy === opt.key ? "#14171C" : "#E2E5EA",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <select
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                  className="text-[10px] uppercase tracking-wide px-2 py-1.5 rounded border bg-[#F6F7F9] text-[#14171C] outline-none"
                  style={{ borderColor: "#E2E5EA", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {SPORT_FILTERS.map((f) => (
                    <option key={f} value={f}>{f === "All" ? "All Sports" : f}</option>
                  ))}
                </select>
              </div>
            </div>
            {displayedStreams.length === 0 && (
              <div className="rounded border border-dashed px-3 py-6 text-center text-xs text-[#6B7280]" style={{ borderColor: "#E2E5EA" }}>
                {showCompleted ? "No completed events yet." : "No games match this filter."}
              </div>
            )}
            {displayedStreams.map((s) => (
              <StreamCard
                key={s.id}
                stream={s}
                expanded={expandedId === s.id}
                onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                onClaim={claimRole}
                onRelease={releaseRole}
                onSubmitEval={submitEval}
                onAddAttendee={addAttendee}
                onRemoveAttendee={removeAttendee}
                roster={roster}
                studentIdentity={studentIdentity}
                accessLevel={accessLevel}
                onRequireSignIn={requireSignIn}
              />
            ))}
          </div>
        )}

        {tab === "calendar" && (
          <CalendarView streams={streams} onSelectStream={setCalendarStreamId} />
        )}

        {tab === "content" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-y-2">
              <h2 className="text-[11px] uppercase tracking-[0.15em] text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                Production Pipeline
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-[#6B7280] mr-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    Sort
                  </span>
                  {[{ key: "due", label: "Due Date" }, { key: "title", label: "Title" }].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setJobSortBy(opt.key)}
                      className="text-[10px] uppercase tracking-wide px-2 py-1 rounded border"
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: jobSortBy === opt.key ? "#FFFFFF" : "#14171C",
                        backgroundColor: jobSortBy === opt.key ? "#14171C" : "#F6F7F9",
                        borderColor: jobSortBy === opt.key ? "#14171C" : "#E2E5EA",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => (studentIdentity ? setShowAddJob(true) : requireSignIn())}
                  className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium px-3 py-1.5 rounded"
                  style={{ backgroundColor: "#E8362E", color: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  <PlusCircle size={13} /> Post Job
                </button>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
              {STAGES.map((stage) => {
                const stageJobs = jobs
                  .filter((j) => j.stage === stage.key)
                  .slice()
                  .sort((a, b) => (jobSortBy === "title" ? a.title.localeCompare(b.title) : (a.due || "").localeCompare(b.due || "")));
                return (
                  <div key={stage.key} className="flex-shrink-0 w-64">
                    <div className="flex items-center gap-1.5 mb-2 px-0.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-[11px] uppercase tracking-wide text-[#14171C]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                        {stage.label}
                      </span>
                      <span className="text-[11px] text-[#14171C] opacity-60">({stageJobs.length})</span>
                    </div>
                    <div className="space-y-2 min-h-[60px]">
                      {stageJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          onMove={moveJob}
                          onDelete={deleteJob}
                          onLinkChange={linkChange}
                          onPickUp={pickUpJob}
                          onKick={kickFromJob}
                          studentIdentity={studentIdentity}
                          accessLevel={accessLevel}
                          onRequireSignIn={requireSignIn}
                        />
                      ))}
                      {stageJobs.length === 0 && (
                        <div className="rounded border border-dashed px-3 py-4 text-center text-[11px] text-[#14171C] opacity-50" style={{ borderColor: "#E2E5EA" }}>
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "links" && (
          <LinksView links={links} onAdd={addLink} onDelete={deleteLink} studentIdentity={studentIdentity} onRequireSignIn={requireSignIn} />
        )}
      </div>

      {calendarStreamId && (() => {
        const s = streams.find((x) => x.id === calendarStreamId);
        if (!s) return null;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/40 overflow-y-auto px-4 py-6"
            onClick={() => setCalendarStreamId(null)}
          >
            <div className="w-full max-w-md mx-auto relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setCalendarStreamId(null)}
                className="absolute -top-3 -right-3 z-10 rounded-full p-1.5 shadow"
                style={{ backgroundColor: "#14171C" }}
              >
                <X size={14} color="#FFFFFF" />
              </button>
              <StreamCard
                stream={s}
                expanded={true}
                onToggle={() => setCalendarStreamId(null)}
                onClaim={claimRole}
                onRelease={releaseRole}
                onSubmitEval={submitEval}
                onAddAttendee={addAttendee}
                onRemoveAttendee={removeAttendee}
                roster={roster}
                studentIdentity={studentIdentity}
                accessLevel={accessLevel}
                onRequireSignIn={requireSignIn}
              />
            </div>
          </div>
        );
      })()}

      {showAddJob && (
        <AddJobModal
          onClose={() => setShowAddJob(false)}
          onAdd={addJob}
          studentIdentity={studentIdentity}
        />
      )}

      {/* Mobile bottom nav — hidden on desktop, fixed on small screens */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t"
        style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFFf7", backdropFilter: "blur(6px)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map(({ key, shortLabel, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
            >
              <Icon size={20} color={active ? "#E8362E" : "#6B7280"} />
              <span
                className="text-[9px] uppercase tracking-wide font-medium"
                style={{ color: active ? "#14171C" : "#6B7280", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {shortLabel}
              </span>
            </button>
          );
        })}
      </div>

      {showAdmin && accessLevel === "admin" && (
        <AdminPanel
          streams={streams}
          onAdd={addStream}
          onUpdate={updateStream}
          onDelete={deleteStream}
          onClose={() => setShowAdmin(false)}
          passcodes={passcodes}
          onUpdatePasscodes={setPasscodes}
          roster={roster}
          onAddRosterEntry={addRosterEntry}
          onAddRosterEntries={addRosterEntries}
          onDeleteRosterEntry={deleteRosterEntry}
          reminderHours={reminderHours}
          onUpdateReminderHours={setReminderHours}
        />
      )}

      {showSignIn && (
        <StudentSignInModal
          roster={roster}
          onClose={() => setShowSignIn(false)}
          onSignIn={(match) => { setStudentIdentity({ id: match.id, name: match.name, email: match.email }); setShowSignIn(false); }}
        />
      )}
    </div>
  );
}
