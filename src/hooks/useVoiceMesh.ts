import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Multi-peer (mesh) WebRTC voice chat for Watch Together rooms.
// Signalling rides on a Supabase realtime broadcast channel; every pair of
// peers gets its own RTCPeerConnection. The peer with the smaller id always
// creates the offer, so there is never a glare/collision.

const RTC_CFG: RTCConfiguration = {
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

interface Peer {
  pc: RTCPeerConnection;
  sender?: RTCRtpSender;
  stream: MediaStream;
  analyser?: AnalyserNode;
}

export function useVoiceMesh(room: string, myId: string, active: boolean) {
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const localAnalyser = useRef<AnalyserNode | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const acRef = useRef<AudioContext | null>(null);
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const micOnRef = useRef(false);
  const speakerRef = useRef(true);

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      chRef.current?.send({ type: "broadcast", event, payload: { from: myId, ...payload } });
    },
    [myId],
  );

  const ctx = () => {
    acRef.current ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return acRef.current;
  };

  const attachAudio = useCallback((peerId: string, stream: MediaStream) => {
    let el = audioElsRef.current.get(peerId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audioElsRef.current.set(peerId, el);
      document.body.appendChild(el);
    }
    el.srcObject = stream;
    el.muted = !speakerRef.current;
    void el.play().catch(() => {});
    try {
      const ac = ctx();
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(an);
      const p = peersRef.current.get(peerId);
      if (p) p.analyser = an;
    } catch {
      /* meter is optional */
    }
  }, []);

  const ensureLocal = useCallback(async (): Promise<MediaStream | null> => {
    if (localRef.current) return localRef.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localRef.current = s;
      try {
        const ac = ctx();
        const an = ac.createAnalyser();
        an.fftSize = 512;
        ac.createMediaStreamSource(s).connect(an);
        localAnalyser.current = an;
      } catch {
        /* optional */
      }
      return s;
    } catch {
      return null;
    }
  }, []);

  const getPeer = useCallback(
    (peerId: string): Peer => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CFG);
      const stream = new MediaStream();
      const peer: Peer = { pc, stream };
      peersRef.current.set(peerId, peer);
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch {
        /* older browsers */
      }
      peer.sender = pc.getSenders()[0];
      const local = localRef.current?.getAudioTracks()[0];
      if (local && peer.sender) void peer.sender.replaceTrack(local);
      pc.ontrack = (e) => {
        e.streams[0]?.getAudioTracks().forEach((t) => {
          if (!peer.stream.getTracks().includes(t)) peer.stream.addTrack(t);
        });
        attachAudio(peerId, peer.stream);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send("v-ice", { to: peerId, candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          void (async () => {
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              send("v-offer", { to: peerId, sdp: offer });
            } catch {
              /* ignore */
            }
          })();
        }
      };
      return peer;
    },
    [attachAudio, send],
  );

  const offerTo = useCallback(
    async (peerId: string) => {
      const { pc } = getPeer(peerId);
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send("v-offer", { to: peerId, sdp: offer });
    },
    [getPeer, send],
  );

  useEffect(() => {
    if (!active || !room || !myId) return;
    const ch = supabase.channel(`watchvoice:${room}`, { config: { broadcast: { self: false } } });
    chRef.current = ch;

    const flushIce = async (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      const q = pendingIce.current.get(peerId) ?? [];
      if (!peer?.pc.remoteDescription) return;
      pendingIce.current.set(peerId, []);
      for (const c of q) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          /* ignore */
        }
      }
    };

    ch.on("broadcast", { event: "v-join" }, ({ payload }) => {
      const p = payload as { from: string };
      if (!p.from || p.from === myId) return;
      send("v-hello", { to: p.from });
      if (myId < p.from) void offerTo(p.from);
    })
      .on("broadcast", { event: "v-hello" }, ({ payload }) => {
        const p = payload as { from: string; to: string };
        if (p.to !== myId || p.from === myId) return;
        if (myId < p.from) void offerTo(p.from);
      })
      .on("broadcast", { event: "v-offer" }, ({ payload }) => {
        const p = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit };
        if (p.to !== myId) return;
        void (async () => {
          const { pc } = getPeer(p.from);
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
          await flushIce(p.from);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("v-answer", { to: p.from, sdp: answer });
        })();
      })
      .on("broadcast", { event: "v-answer" }, ({ payload }) => {
        const p = payload as { from: string; to: string; sdp: RTCSessionDescriptionInit };
        if (p.to !== myId) return;
        void (async () => {
          const peer = peersRef.current.get(p.from);
          if (!peer || peer.pc.signalingState !== "have-local-offer") return;
          await peer.pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
          await flushIce(p.from);
        })();
      })
      .on("broadcast", { event: "v-ice" }, ({ payload }) => {
        const p = payload as { from: string; to: string; candidate: RTCIceCandidateInit };
        if (p.to !== myId) return;
        const peer = peersRef.current.get(p.from);
        if (peer?.pc.remoteDescription) {
          void peer.pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(() => {});
        } else {
          const q = pendingIce.current.get(p.from) ?? [];
          q.push(p.candidate);
          pendingIce.current.set(p.from, q);
        }
      })
      .on("broadcast", { event: "v-bye" }, ({ payload }) => {
        const p = payload as { from: string };
        const peer = peersRef.current.get(p.from);
        if (peer) {
          peer.pc.close();
          peersRef.current.delete(p.from);
        }
        const el = audioElsRef.current.get(p.from);
        if (el) {
          el.srcObject = null;
          el.remove();
          audioElsRef.current.delete(p.from);
        }
      });

    void ch.subscribe((status) => {
      if (status === "SUBSCRIBED") send("v-join", {});
    });

    const peers = peersRef.current;
    const audioEls = audioElsRef.current;
    return () => {
      send("v-bye", {});
      peers.forEach((p) => p.pc.close());
      peers.clear();
      audioEls.forEach((el) => {
        el.srcObject = null;
        el.remove();
      });
      audioEls.clear();
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [active, room, myId, getPeer, offerTo, send]);

  useEffect(() => {
    if (!active) return;
    const buf = new Uint8Array(256);
    const level = (an?: AnalyserNode | null) => {
      if (!an) return 0;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buf.length);
    };
    const t = setInterval(() => {
      const next: Record<string, boolean> = {};
      peersRef.current.forEach((p, id) => {
        next[id] = level(p.analyser) > 0.045;
      });
      next[myId] = micOnRef.current && level(localAnalyser.current) > 0.045;
      setSpeaking((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) if (!!prev[k] !== !!next[k]) return next;
        return prev;
      });
    }, 250);
    return () => clearInterval(t);
  }, [active, myId]);

  const toggleMic = useCallback(async () => {
    if (micOnRef.current) {
      localRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
      micOnRef.current = false;
      setMicOn(false);
      return;
    }
    const s = await ensureLocal();
    if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = true));
    const track = s.getAudioTracks()[0];
    peersRef.current.forEach((p) => {
      const sender = p.sender ?? p.pc.getSenders()[0];
      if (sender) void sender.replaceTrack(track);
    });
    void acRef.current?.resume().catch(() => {});
    micOnRef.current = true;
    setMicOn(true);
  }, [ensureLocal]);

  const toggleSpeaker = useCallback(() => {
    speakerRef.current = !speakerRef.current;
    audioElsRef.current.forEach((el) => (el.muted = !speakerRef.current));
    setSpeakerOn(speakerRef.current);
  }, []);

  return { micOn, toggleMic, speakerOn, toggleSpeaker, speaking };
}
