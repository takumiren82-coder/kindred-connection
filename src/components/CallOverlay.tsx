import { useEffect, useRef, useState } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  SwitchCamera,
  Volume2,
  VolumeX,
  NotebookPen,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// WebRTC audio call over Supabase realtime broadcast for SDP/ICE exchange.
// Uses public STUN only, so it works on same-network / non-symmetric-NAT setups;
// enterprise-grade calling would need a TURN server (not free).

type Mode = "outgoing" | "incoming";
type Phase = "ringing" | "connecting" | "in-call" | "ended";

interface Props {
  room: string;
  myId: string;
  peerName: string;
  mode: Mode;
  onClose: () => void;
  // for incoming, the offer is passed in
  incomingOffer?: RTCSessionDescriptionInit;
  // true = video call, false = audio call
  video?: boolean;
}

const RTC_CFG: RTCConfiguration = {
  // STUN handles most home networks; the free Metered "openrelay" TURN acts
  // as a fallback so calls also work across symmetric NATs / carrier networks
  // — this is what fixes "one side hears / sees the other but not vice versa".
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

export function CallOverlay({ room, myId, peerName, mode, onClose, incomingOffer, video = false }: Props) {
  const [phase, setPhase] = useState<Phase>(mode === "outgoing" ? "ringing" : "ringing");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [secs, setSecs] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [loud, setLoud] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Buffered local ICE candidates. Supabase broadcast is fire-and-forget, so
  // anything we emit before the peer's channel actually subscribes is lost.
  // We keep a copy and re-flush whenever we hear from the peer.
  const localCandBuf = useRef<RTCIceCandidateInit[]>([]);
  // Buffered remote ICE candidates that arrived before pc.setRemoteDescription.
  const pendingRemote = useRef<RTCIceCandidateInit[]>([]);
  const peerReady = useRef(false);
  // Kept so we can re-broadcast the SDP if the peer joined the signalling
  // channel late (Supabase broadcast is fire-and-forget → lost packets are
  // the usual cause of "they hear me but I don't hear them").
  const myOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const myAnswer = useRef<RTCSessionDescriptionInit | null>(null);
  const negotiated = useRef(false);

  const flushLocalIce = () => {
    const ch = chRef.current;
    if (!ch) return;
    for (const c of localCandBuf.current) {
      ch.send({ type: "broadcast", event: "ice", payload: { from: myId, candidate: c } });
    }
  };
  const applyPendingRemote = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queue = pendingRemote.current;
    pendingRemote.current = [];
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    const channel = supabase.channel(`call:${room}`, { config: { broadcast: { self: false } } });
    chRef.current = channel;

    const pc = new RTCPeerConnection(RTC_CFG);
    pcRef.current = pc;
    // Always declare both directions up front so the SDP carries a sendrecv
    // m-line for audio (and video) even if a track is added a moment later.
    try {
      pc.addTransceiver("audio", { direction: "sendrecv" });
      if (video) pc.addTransceiver("video", { direction: "sendrecv" });
    } catch { /* older browsers */ }
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      remoteStreamRef.current = stream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setPhase("in-call");
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") negotiated.current = true;
      if (pc.connectionState === "failed") {
        // Renegotiate with an ICE restart instead of dying one-way.
        void (async () => {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            myOffer.current = offer;
            channel.send({ type: "broadcast", event: "offer", payload: { from: myId, offer, peerName, video } });
          } catch { /* ignore */ }
        })();
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const cand = e.candidate.toJSON();
        localCandBuf.current.push(cand);
        channel.send({ type: "broadcast", event: "ice", payload: { from: myId, candidate: cand } });
      }
    };

    channel
      .on("broadcast", { event: "answer" }, async ({ payload }) => {
        if (payload.from === myId) return;
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          setPhase("connecting");
          await applyPendingRemote();
          // Peer is definitely subscribed if we got their answer → re-flush.
          if (!peerReady.current) { peerReady.current = true; flushLocalIce(); }
        }
      })
      .on("broadcast", { event: "offer" }, async ({ payload }) => {
        // A re-offer (ICE restart / late join) for the callee side.
        if (payload.from === myId || mode === "outgoing") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          myAnswer.current = answer;
          channel.send({ type: "broadcast", event: "answer", payload: { from: myId, answer } });
          await applyPendingRemote();
        } catch { /* ignore */ }
      })
      .on("broadcast", { event: "hello" }, ({ payload }) => {
        if (payload.from === myId) return;
        peerReady.current = true;
        // Peer just subscribed. Re-send any ICE candidates we already emitted.
        flushLocalIce();
        // …and the SDP, in case the first broadcast was sent before they
        // were listening. Without this the peer never gets our media.
        if (myOffer.current) {
          channel.send({ type: "broadcast", event: "offer", payload: { from: myId, offer: myOffer.current, peerName, video } });
        } else if (myAnswer.current) {
          channel.send({ type: "broadcast", event: "answer", payload: { from: myId, answer: myAnswer.current } });
        }
      })
      .on("broadcast", { event: "ice" }, async ({ payload }) => {
        if (payload.from === myId) return;
        if (!peerReady.current) { peerReady.current = true; flushLocalIce(); }
        if (!pc.remoteDescription) {
          pendingRemote.current.push(payload.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch { /* ignore */ }
      })
      .on("broadcast", { event: "bye" }, ({ payload }) => {
        if (payload.from === myId) return;
        endCall(true);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        // Announce readiness so the peer can (re)flush its buffered ICE.
        channel.send({ type: "broadcast", event: "hello", payload: { from: myId } });
        try {
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: video ? { facingMode: "user" } : false,
            });
          } catch {
            // Camera busy/denied → still join with audio so the call works.
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          }
          localStreamRef.current = stream;
          // Attach to the pre-created transceivers so our media is always
          // actually sent (addTrack alone can land on a recvonly m-line).
          for (const t of stream.getTracks()) {
            const sender = pc.getTransceivers().find(
              (tr) => tr.receiver.track?.kind === t.kind && !tr.sender.track,
            )?.sender;
            if (sender) await sender.replaceTrack(t);
            else pc.addTrack(t, stream);
          }
          if (video && localVideoRef.current) localVideoRef.current.srcObject = stream;

          if (mode === "outgoing") {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            myOffer.current = offer;
            channel.send({ type: "broadcast", event: "offer", payload: { from: myId, offer, peerName, video } });
          } else if (incomingOffer) {
            await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            myAnswer.current = answer;
            channel.send({ type: "broadcast", event: "answer", payload: { from: myId, answer } });
            setPhase("connecting");
            await applyPendingRemote();
          }
        } catch (e) {
          console.error("call setup failed", e);
          endCall(true);
        }
      });

    // Keep re-announcing until the peer connection is actually up, so a slow
    // network or a late-joining peer can still complete the handshake.
    const retry = setInterval(() => {
      if (negotiated.current || pc.connectionState === "connected") return;
      channel.send({ type: "broadcast", event: "hello", payload: { from: myId } });
      if (myOffer.current) {
        channel.send({ type: "broadcast", event: "offer", payload: { from: myId, offer: myOffer.current, peerName, video } });
      } else if (myAnswer.current) {
        channel.send({ type: "broadcast", event: "answer", payload: { from: myId, answer: myAnswer.current } });
      }
      flushLocalIce();
    }, 1500);

    return () => {
      clearInterval(retry);
      pc.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "in-call") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const endCall = (skipBye = false) => {
    if (!skipBye) chRef.current?.send({ type: "broadcast", event: "bye", payload: { from: myId } });
    setPhase("ended");
    setTimeout(onClose, 400);
  };

  const toggleMute = () => {
    const enabled = localStreamRef.current?.getAudioTracks()[0]?.enabled;
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !enabled));
    setMuted(!!enabled);
  };

  // Loud / earpiece toggle — keeps remote audio audible either way.
  const toggleLoud = () => {
    const el = remoteAudioRef.current;
    const next = !loud;
    if (el) {
      el.volume = next ? 1 : 0.45;
      const anyEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      anyEl.setSinkId?.(next ? "" : "").catch(() => {});
    }
    setLoud(next);
  };

  // In-call notes, stored locally per room (no backend change).
  const NOTE_KEY = `ember_call_note_${room}`;
  const openNote = () => {
    try { setNote(localStorage.getItem(NOTE_KEY) ?? ""); } catch { /* ignore */ }
    setNoteOpen(true);
  };
  const saveNote = (v: string) => {
    setNote(v);
    try { localStorage.setItem(NOTE_KEY, v); } catch { /* ignore */ }
  };

  const toggleCam = () => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return;
    const enabled = tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = !enabled));
    setCamOff(enabled);
  };

  const flipCamera = async () => {
    if (!video) return;
    const next = facing === "user" ? "environment" : "user";
    const oldTracks = localStreamRef.current?.getVideoTracks() ?? [];
    // Stop existing video tracks first so the OS releases the camera before
    // we ask for the other lens — otherwise some devices hand back a dead
    // track and the preview stays black.
    oldTracks.forEach((t) => t.stop());
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: next } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const pc = pcRef.current;
      const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(newTrack);
      const old = localStreamRef.current;
      if (old) {
        old.getVideoTracks().forEach((t) => old.removeTrack(t));
        old.addTrack(newTrack);
        if (localVideoRef.current) {
          // Force the <video> to pick up the new track by re-assigning srcObject.
          localVideoRef.current.srcObject = null;
          localVideoRef.current.srcObject = old;
          try { await localVideoRef.current.play(); } catch { /* ignore */ }
        }
      }
      // sync toggle-state with the new track
      newTrack.enabled = !camOff ? true : false;
      setFacing(next);
    } catch (e) {
      console.error("flip camera failed", e);
      // Try to recover the previous facing so we don't get stuck with no camera.
      try {
        const recover = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing } },
        });
        const rt = recover.getVideoTracks()[0];
        const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === "video");
        await sender?.replaceTrack(rt);
        const s = localStreamRef.current;
        if (s) {
          s.getVideoTracks().forEach((t) => s.removeTrack(t));
          s.addTrack(rt);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
            localVideoRef.current.srcObject = s;
          }
        }
      } catch { /* ignore */ }
    }
  };

  const label =
    phase === "ringing" ? (mode === "outgoing" ? "Calling…" : "Incoming call…")
    : phase === "connecting" ? "Connecting…"
    : phase === "in-call" ? `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`
    : "Call ended";

  // PiP drag handlers — clamped to viewport with a small safe margin.
  const onPipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pipPos.x,
      origY: pipPos.y,
      moved: false,
    };
  };
  const onPipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pipW = 112; // matches w-28
    const pipH = 160; // matches h-40
    const nx = Math.min(Math.max(8, d.origX + dx), w - pipW - 8);
    const ny = Math.min(Math.max(8, d.origY + dy), h - pipH - 8);
    setPipPos({ x: nx, y: ny });
  };
  const onPipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (d && !d.moved) {
      // Treated as a tap → swap large/small views.
      setSwapped((s) => !s);
    }
  };

  const selfInitial = "Y"; // "You"
  const peerInitial = peerName.charAt(0).toUpperCase();

  const controls = (
    <>
      <button
        onClick={toggleMute}
        aria-label="Mute"
        className={`ember-ctrl ${muted ? "border-primary/70 bg-primary/15 text-primary" : ""}`}
      >
        {muted ? <MicOff className="h-[22px] w-[22px]" /> : <Mic className="h-[22px] w-[22px]" />}
      </button>
      {video && (
        <>
          <button
            onClick={toggleCam}
            aria-label="Camera"
            className={`ember-ctrl ${camOff ? "border-primary/70 bg-primary/15 text-primary" : ""}`}
          >
            {camOff ? <VideoOff className="h-[22px] w-[22px]" /> : <VideoIcon className="h-[22px] w-[22px]" />}
          </button>
          <button onClick={flipCamera} aria-label="Flip camera" className="ember-ctrl">
            <SwitchCamera className="h-[22px] w-[22px]" />
          </button>
        </>
      )}
      <button
        onClick={toggleLoud}
        aria-label="Speaker"
        className={`ember-ctrl ${loud ? "border-primary/70 bg-primary/15 text-primary" : ""}`}
      >
        {loud ? <Volume2 className="h-[22px] w-[22px]" /> : <VolumeX className="h-[22px] w-[22px]" />}
      </button>
      <button onClick={openNote} aria-label="Note" className="ember-ctrl">
        <NotebookPen className="h-[22px] w-[22px]" />
      </button>
      <button
        onClick={() => endCall()}
        aria-label="End call"
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_26px_-8px_rgba(255,46,63,0.9)] active:scale-95"
      >
        <PhoneOff className="h-[22px] w-[22px]" />
      </button>
    </>
  );

  const noteSheet = noteOpen ? (
    <div className="absolute inset-0 z-30 flex items-end bg-black/70 backdrop-blur-sm" onClick={() => setNoteOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl border-t border-border bg-[#0c0c0f] px-5 pb-8 pt-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-foreground">Call Note</h3>
          <button onClick={() => setNoteOpen(false)} aria-label="Close" className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <textarea
          value={note}
          onChange={(e) => saveNote(e.target.value)}
          rows={5}
          placeholder="Quick note while talking…"
          className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">Saved automatically on this device.</p>
      </div>
    </div>
  ) : null;

  // ---------- Voice call ----------
  if (!video) {
    return (
      <div className="animate-fade-in fixed inset-0 z-[80] flex flex-col bg-[#08080a] px-6 pb-10 pt-8">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-heading text-base font-semibold text-foreground">
            {peerInitial}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-heading text-[17px] font-semibold text-foreground">{peerName}</span>
            <span className="text-[12px] text-muted-foreground">{label}</span>
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-10 flex h-16 items-center justify-center gap-[3px]">
          {Array.from({ length: 44 }).map((_, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-primary"
              style={{
                height: `${8 + Math.abs(Math.sin(i * 0.7)) * 46}px`,
                opacity: 0.55 + Math.abs(Math.cos(i * 0.5)) * 0.45,
                animation: `wave-pulse 1.1s ease-in-out ${i * 0.045}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Glowing avatar */}
        <div className="mt-8 flex justify-center">
          <span className="flex h-[132px] w-[132px] items-center justify-center rounded-full border-2 border-primary bg-[#101013] shadow-[0_0_60px_-10px_rgba(255,46,63,0.95)]">
            <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full bg-secondary font-heading text-4xl font-semibold text-foreground">
              {peerInitial}
            </span>
          </span>
        </div>

        {/* Controls */}
        <div className="mt-auto flex flex-wrap items-center justify-center gap-5 pb-2">{controls}</div>
        {noteSheet}
      </div>
    );
  }

  // ---------- Video call ----------
  return (
    <div className="animate-fade-in fixed inset-0 z-[80] bg-black">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full object-cover ${swapped ? "hidden" : ""}`}
      />
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${swapped ? "" : "hidden"} ${camOff && swapped ? "invisible" : ""}`}
      />
      {((swapped && camOff) || (!swapped && !remoteStreamRef.current)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#08080a]">
          <div className="flex h-36 w-36 items-center justify-center rounded-full border-2 border-primary bg-secondary font-heading text-5xl text-foreground shadow-[0_0_60px_-10px_rgba(255,46,63,0.9)]">
            {swapped ? selfInitial : peerInitial}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-heading text-sm font-semibold text-foreground">
          {peerInitial}
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-heading text-[16px] font-semibold text-foreground">{peerName}</span>
          <span className="text-[12px] text-muted-foreground">{label}</span>
        </div>
      </div>

      {/* Draggable PiP */}
      <div
        onPointerDown={onPipPointerDown}
        onPointerMove={onPipPointerMove}
        onPointerUp={onPipPointerUp}
        onPointerCancel={onPipPointerUp}
        style={{ left: pipPos.x, top: pipPos.y, touchAction: "none" }}
        className="absolute z-20 h-40 w-28 overflow-hidden rounded-2xl border border-white/15 bg-black shadow-lg"
      >
        {!swapped ? (
          camOff ? (
            <div className="flex h-full w-full items-center justify-center bg-[#0c0c0f]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary font-heading text-2xl text-foreground">
                {selfInitial}
              </div>
            </div>
          ) : (
            <video
              autoPlay
              playsInline
              muted
              className="pointer-events-none h-full w-full -scale-x-100 object-cover"
              ref={(el) => {
                if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                  el.srcObject = localStreamRef.current;
                }
              }}
            />
          )
        ) : (
          <video
            autoPlay
            playsInline
            className="pointer-events-none h-full w-full object-cover"
            ref={(el) => {
              if (el && remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
                el.srcObject = remoteStreamRef.current;
              }
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-4 bg-gradient-to-t from-black/85 to-transparent px-4 pb-8 pt-10">
        {controls}
      </div>
      {noteSheet}
    </div>
  );
}
