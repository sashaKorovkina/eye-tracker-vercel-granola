"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  // Effect to handle permissions and get stream
  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    let localStream: MediaStream | null = null; // Keep track of the stream locally within this effect

    const checkAndRequestPermission = async () => {
      try {
        try {
          permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
          console.log("Initial permission state:", permissionStatus.state);

          if (permissionStatus.state === "granted") {
            setHasCameraPermission(true);
            await enableCamera(); // Request immediately if granted
          } else if (permissionStatus.state === "prompt") {
            setHasCameraPermission(null); // Explicitly unknown
            await enableCamera();
          } else {
            setHasCameraPermission(false); // Denied
          }

          permissionStatus.onchange = async () => {
            console.log("Permission changed:", permissionStatus?.state);
            if (permissionStatus?.state === "granted") {
              setHasCameraPermission(true);
              if (!localStream) { // Only enable if not already enabled
                await enableCamera();
              }
            } else {
              setHasCameraPermission(false);
              stopStream(); // Stop if permission revoked
            }
          };
        } catch (permError) {
          console.warn("Permissions API not supported or failed, attempting getUserMedia directly:", permError);
          setHasCameraPermission(null); 
          await enableCamera();
        }
      } catch (error) {
         console.error("Error during permission check or camera enabling:", error);
         setHasCameraPermission(false);
         stopStream();
      }
    };

    const enableCamera = async () => {
      // Avoid requesting if already have a stream or permission explicitly denied
      if (localStream || hasCameraPermission === false) return;

      try {
        console.log("Requesting camera access...");
        localStream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log("Camera access granted, stream obtained.");
        setStream(localStream); 
        setHasCameraPermission(true); 
      } catch (error) {
        console.error("Error accessing camera:", error);
        setHasCameraPermission(false);
        setStream(null); 
        stopStream();
      }
    };

    const stopStream = () => {
      console.log("Stopping stream...");
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
      }
      setStream(null);
    };

    checkAndRequestPermission();

    // Cleanup function for the effect
    return () => {
      console.log("Cleanup: Stopping stream and removing listener.");
      stopStream();
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject = null; 
      }
      if (permissionStatus) {
        permissionStatus.onchange = null; 
      }
    };
  }, []);

  // Effect to handle attaching stream to video element and playing
  // This useEffect needs to be outside the return statement
  useEffect(() => {
    if (videoRef.current && stream) {
      console.log("Attaching stream to video element.");
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(error => {
          console.error("Error attempting to play video:", error);
      });
    } else {
       if (videoRef.current?.srcObject) {
           console.log("Clearing stream from video element.");
           videoRef.current.srcObject = null;
       }
    }
  }, [stream]); // Re-run when the stream state changes

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <main className="p-8 rounded-lg shadow-md bg-white">
        <h1 className="text-2xl font-bold mb-4 text-center">Camera Access</h1>
        {hasCameraPermission === true && stream ? (
          <video
            ref={videoRef}
            className="w-64 h-48 rounded-md bg-black" 
            autoPlay
            playsInline
            muted 
          />
        ) : (
          <p className="text-center text-gray-600">Camera access not available.</p>
        )}
      </main>
    </div>
  );
}
