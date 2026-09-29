import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AgoraRTC from "agora-rtc-sdk-ng";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import PinVerificationModal from "../components/PinVerificationModal";
import Spinner from "../components/Spinner";

export default function VideoCall() {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });

  const [appointment, setAppointment] = useState(null);
  const [loadingAppointment, setLoadingAppointment] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pinVerified, setPinVerified] = useState(false);

  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const isPatient = appointment && user.uid === appointment.patientId;

  // Fetch the appointment first so we know whether the current user is the
  // patient (who must clear the PIN gate) or the doctor (who does not).
  useEffect(() => {
    api
      .get(`/appointments/${appointmentId}`)
      .then(({ data }) => {
        setAppointment(data.appointment);
        // Doctors — and a patient whose PIN was already verified in a
        // previous visit to this page — skip straight to joining.
        if (data.appointment.patientId !== user.uid || data.appointment.pinStatus === "used") {
          setPinVerified(true);
        }
      })
      .catch((err) => {
        setLoadError(err.response?.data?.message || "Could not load this appointment.");
      })
      .finally(() => setLoadingAppointment(false));
  }, [appointmentId, user.uid]);

  // Only join the Agora room once the appointment is loaded AND (for
  // patients) the PIN gate has been cleared. The server independently
  // re-checks pinStatus when issuing the video token, so this is a UX
  // gate on top of a real security boundary, not a substitute for it.
  useEffect(() => {
    if (!appointment || !pinVerified) return;

    let isMounted = true;
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;

    async function join() {
      try {
        setStatus("Requesting video access…");
        const { data } = await api.post(`/appointments/${appointmentId}/video-token`);

        client.on("user-published", async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "video" && remoteVideoRef.current) {
            remoteUser.videoTrack.play(remoteVideoRef.current);
          }
          if (mediaType === "audio") {
            remoteUser.audioTrack.play();
          }
        });

        client.on("user-unpublished", () => {
          setStatus("The other participant has left the call.");
        });

        await client.join(data.appId, data.channelName, data.token, data.uid);

        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = { audioTrack, videoTrack };

        if (isMounted && localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }

        await client.publish([audioTrack, videoTrack]);

        if (isMounted) setStatus("Connected");
      } catch (err) {
        console.error("[VideoCall] Failed to join:", err);
        if (isMounted) {
          setError(
            err.response?.data?.message ||
              "Could not start the video consultation. Please check your camera/microphone permissions and try again."
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
  }, [appointment, pinVerified, appointmentId]);

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

  const endCall = () => navigate(-1);

  if (loadingAppointment) {
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Video Consultation</h1>
        <span className="text-sm font-medium text-slate-500">{pinVerified ? status : "Locked"}</span>
      </div>

      {isPatient && !pinVerified && (
        <PinVerificationModal
          appointmentId={appointmentId}
          onVerified={() => setPinVerified(true)}
          onCancel={() => navigate(-1)}
        />
      )}

      {pinVerified && (
        <>
          {error ? (
            <div className="mt-6 rounded-lg bg-red-50 px-4 py-3.5 text-sm text-red-700">{error}</div>
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
            <button onClick={endCall} className="btn-primary !bg-red-600 hover:!bg-red-700">
              End call
            </button>
          </div>
        </>
      )}
    </div>
  );
}
