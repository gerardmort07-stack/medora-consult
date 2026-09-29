import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { getGuestSession, guestApi } from "../lib/guestSession";
import Spinner from "../components/Spinner";

export default function ConsultationRoom() {
  const { appointmentId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });

  const [actor, setActor] = useState(null); // { type: "doctor" } | { type: "guest", guestToken }
  const [appointment, setAppointment] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState("Connecting…");
  const [callError, setCallError] = useState("");
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [remoteLeft, setRemoteLeft] = useState(false);
  const [endingCall, setEndingCall] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Work out who's joining: a logged-in doctor/admin uses the normal app
  // session; anyone else must have a valid guest session for THIS
  // appointment (from the Access Portal) or gets sent back there.
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      setActor({ type: "doctor" });
      api
        .get(`/appointments/${appointmentId}`)
        .then(({ data }) => setAppointment(data.appointment))
        .catch((err) => setLoadError(err.response?.data?.message || "Could not load this appointment."))
        .finally(() => setLoading(false));
      return;
    }

    const session = getGuestSession(appointmentId);
    if (!session) {
      navigate("/access", { replace: true });
      return;
    }
    setActor({ type: "guest", guestToken: session.guestToken });
    guestApi
      .getAppointment(appointmentId, session.guestToken)
      .then(({ data }) => setAppointment(data.appointment))
      .catch((err) => setLoadError(err.response?.data?.message || "Could not load this appointment."))
      .finally(() => setLoading(false));
  }, [authLoading, user, appointmentId, navigate]);

  // Join the Agora room once we know who's joining and the appointment is
  // actually ready (status in_session, channel attached).
  useEffect(() => {
    if (!actor || !appointment) return;
    if (appointment.status !== "in_session" || !appointment.channelName) return;

    let isMounted = true;
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    async function join() {
      try {
        setCallError("");
        setRemoteLeft(false);
        setStatus("Requesting video access…");

        // NOTE: api.post(...) / guestApi.getVideoToken(...) already resolve
        // to the axios response object, whose .data IS the JSON body
        // ({ token, appId, channelName, uid, expiresAt }) — there is no
        // further nested .data inside that. (A previous version of this
        // file double-unwrapped this, leaving `data` undefined and
        // throwing exactly on data.appId below.)
        const response =
          actor.type === "doctor"
            ? await api.post(`/appointments/${appointmentId}/video-token`)
            : await guestApi.getVideoToken(appointmentId, actor.guestToken);
        const data = response.data;

        // Defensive check: if the backend ever responds with an
        // unexpected shape (rather than throwing an HTTP error — e.g. a
        // proxy/gateway rewriting the body), fail with a clear message
        // instead of a cryptic "Cannot read properties of undefined"
        // three lines further down. This deliberately does NOT fall back
        // to a hardcoded/test Agora App ID: silently joining the wrong
        // Agora project would fail in a much more confusing way (or
        // "succeed" into a room nobody else is in) than just stopping here.
        if (!data?.appId || !data?.token || !data?.channelName) {
          throw new Error("The server did not return a valid video session. Please try again.");
        }

        client.on("user-published", async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "video" && remoteVideoRef.current) {
            remoteUser.videoTrack.play(remoteVideoRef.current);
          }
          if (mediaType === "audio") {
            remoteUser.audioTrack.play();
          }
        });

        client.on("user-unpublished", () => setStatus("The other participant has left the call."));
        client.on("user-left", () => setRemoteLeft(true));

        // Camera/mic permission is requested BEFORE joining the Agora
        // channel, not after — so a denial never leaves a "joined but
        // silent" phantom participant sitting in the room for the other
        // party to see.
        setStatus("Requesting camera and microphone access…");
        let audioTrack, videoTrack;
        try {
          [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        } catch (mediaErr) {
          console.error("[ConsultationRoom] Media device error:", mediaErr);
          const denied = mediaErr.name === "NotAllowedError" || mediaErr.code === "PERMISSION_DENIED";
          throw new Error(
            denied
              ? "Camera/microphone access was denied. Please allow access in your browser's site settings and try again."
              : "Could not access your camera or microphone. Please check that no other app is using them."
          );
        }
        localTracksRef.current = { audioTrack, videoTrack };

        setStatus("Connecting…");
        await client.join(data.appId, data.channelName, data.token, data.uid);

        if (isMounted && localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }
        await client.publish([audioTrack, videoTrack]);

        if (isMounted) setStatus("Connected");
      } catch (err) {
        console.error("[ConsultationRoom] Failed to join:", err);
        if (isMounted) {
          setCallError(
            err.response?.data?.message ||
              err.message ||
              "Could not start the video consultation. Please check your camera/microphone permissions."
          );
        }
      }
    }

    join();

    return () => {
      isMounted = false;
      const { audioTrack, videoTrack } = localTracksRef.current;
      audioTrack?.close();
      videoTrack?.close();
      client.leave().catch(() => {});
    };
  }, [actor, appointment, appointmentId, retryKey]);

  const toggleMute = () => {
    const { audioTrack } = localTracksRef.current;
    if (!audioTrack) return;
    audioTrack.setEnabled(muted);
    setMuted(!muted);
  };

  const toggleVideo = () => {
    const { videoTrack } = localTracksRef.current;
    if (!videoTrack) return;
    videoTrack.setEnabled(videoOff);
    setVideoOff(!videoOff);
  };

  // Only the doctor's "End Call" marks the appointment completed — that's
  // what unlocks the patient's rating prompt back on the Access Portal.
  // A patient leaving early doesn't end the session for the doctor.
  const endCall = async () => {
    if (actor?.type === "doctor") {
      setEndingCall(true);
      try {
        await api.patch(`/appointments/${appointmentId}/status`, { status: "completed" });
      } catch (err) {
        console.error(err);
      }
      navigate("/doctor");
    } else {
      navigate("/access");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <Spinner label="Loading consultation…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg bg-red-50 px-4 py-3.5 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }

  if (appointment.status !== "in_session") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <p className="text-sm text-slate-500">This consultation isn't ready for video yet.</p>
        <button onClick={() => navigate(actor?.type === "doctor" ? "/doctor" : "/access")} className="btn-secondary mt-4">
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Video Consultation</h1>
        <span className="text-sm font-medium text-slate-500">{status}</span>
      </div>

      {remoteLeft && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The other participant has left the call.
          {actor?.type === "guest" && " Your doctor may still mark this consultation complete."}
        </div>
      )}

      {callError ? (
        <div className="mt-6 rounded-lg bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <p>{callError}</p>
          <button onClick={() => setRetryKey((k) => k + 1)} className="btn-secondary mt-3 !px-3 !py-1.5 !text-xs">
            Retry
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">You</p>
            <div ref={localVideoRef} className="aspect-video w-full rounded-xl bg-navy" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Participant</p>
            <div ref={remoteVideoRef} className="aspect-video w-full rounded-xl bg-navy" />
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center gap-3">
        <button onClick={toggleMute} className="btn-secondary">
          {muted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleVideo} className="btn-secondary">
          {videoOff ? "Turn video on" : "Turn video off"}
        </button>
        <button onClick={endCall} disabled={endingCall} className="btn-primary !bg-red-600 hover:!bg-red-700">
          {actor?.type === "doctor" ? (endingCall ? "Ending…" : "End & Mark Completed") : "Leave Call"}
        </button>
      </div>
    </div>
  );
}
