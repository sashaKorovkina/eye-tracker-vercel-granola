"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";
const videoWidth = 480;

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blendShapesRef = useRef<HTMLDivElement>(null); // Assuming you want to display blend shapes in a div
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isLandmarkerReady, setIsLandmarkerReady] = useState(false);
  const webcamRunning = useRef(false); // Use useRef for mutable values in effects
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const resultsRef = useRef<any>(undefined);

  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasElementRef.current = node;
    if (node !== null) {
      const context = node.getContext("2d");
      if (context) {
        drawingUtilsRef.current = new DrawingUtils(context);
        console.log("DrawingUtils initialized:", drawingUtilsRef.current);
      } else {
        console.log("2D context could not be retrieved from canvas.");
      }
    } else {
      console.log("Canvas element is null");
    }
  }, []);

  

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    let localStream: MediaStream | null = null;

    const checkAndRequestPermission = async () => {
      try {
        try {
          permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
          console.log("Initial permission state:", permissionStatus.state);

          if (permissionStatus.state === "granted") {
            setHasCameraPermission(true);
            await enableCamera();
          } else if (permissionStatus.state === "prompt") {
            setHasCameraPermission(null);
            await enableCamera();
          } else {
            setHasCameraPermission(false);
          }

          permissionStatus.onchange = async () => {
            console.log("Permission changed:", permissionStatus?.state);
            if (permissionStatus?.state === "granted") {
              setHasCameraPermission(true);
              if (!localStream) {
                await enableCamera();
              }
            } else {
              setHasCameraPermission(false);
              stopStream();
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
      if (localStream || hasCameraPermission === false) return;

      try {
        console.log("Requesting camera access...");
        localStream = await navigator.mediaDevices.getUserMedia({ video: { width: videoWidth } });
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
  }, [videoWidth]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch((error) => {
          console.error("Error playing video:", error);
        });
      };
    }
  }, [stream, videoRef]);

  useEffect(() => {
    const createFaceLandmarker = async () => {
      console.log("Initializing FaceLandmarker...");
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        faceLandmarker = landmarker;
        setIsLandmarkerReady(true);
        console.log("FaceLandmarker initialized successfully:", faceLandmarker);
        if (stream && videoRef.current && canvasElementRef.current && faceLandmarker) {
          webcamRunning.current = true;
          predictWebcam();
        }
      } catch (error) {
        console.error("Error initializing FaceLandmarker:", error);
        setIsLandmarkerReady(false);
      }
    };

    if (!faceLandmarker && stream && videoRef.current && canvasElementRef.current) {
      createFaceLandmarker();
    } else if (faceLandmarker && stream && videoRef.current && canvasElementRef.current && !webcamRunning.current) {
      webcamRunning.current = true;
      predictWebcam();
    }

    return () => {
      if (faceLandmarker) {
        faceLandmarker.close();
        console.log("FaceLandmarker closed.");
      }
      webcamRunning.current = false;
    };
  }, [stream, videoRef, canvasRef]);

  async function predictWebcam() {
    if (!webcamRunning.current || !videoRef.current || !canvasElementRef.current || !faceLandmarker || !drawingUtilsRef.current) {
      console.log("predictWebcam - Not ready:", {
        webcamRunning: webcamRunning.current,
        videoRef: !!videoRef.current,
        canvasRef: !!canvasElementRef.current,
        faceLandmarker: !!faceLandmarker,
        drawingUtilsRef: !!drawingUtilsRef.current,
      });
      return;
    }

    const video = videoRef.current;
    const canvasElement = canvasElementRef.current;
    const canvasCtx = canvasElement.getContext("2d")!;

    const radio = video.videoHeight / video.videoWidth;
    video.style.width = videoWidth + "px";
    video.style.height = videoWidth * radio + "px";
    canvasElement.style.width = videoWidth + "px";
    canvasElement.style.height = videoWidth * radio + "px";
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    console.log("predictWebcam - Canvas dimensions:", {
      width: canvasElement.width,
      height: canvasElement.height,
    });

    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await faceLandmarker.setOptions({ runningMode: runningMode });
      console.log("Running mode set to VIDEO.");
    }

    let startTimeMs = performance.now();
    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      resultsRef.current = faceLandmarker.detectForVideo(video, startTimeMs);
      console.log("Face landmark results:", resultsRef.current);
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (resultsRef.current && resultsRef.current.faceLandmarks) {
      console.log("Drawing landmarks:", resultsRef.current.faceLandmarks.length, "faces detected.");
      for (const landmarks of resultsRef.current.faceLandmarks) {
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: "#C0C0C070", lineWidth: 1 }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
          { color: "#FF3030" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
          { color: "#FF3030" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
          { color: "#30FF30" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
          { color: "#30FF30" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
          { color: "#E0E0E0" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LIPS,
          { color: "#E0E0E0" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
          { color: "#FF3030" }
        );
        drawingUtilsRef.current.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
          { color: "#30FF30" }
        );
      }
    } else {
      console.log("No face landmarks detected in this frame.");
    }
    canvasCtx.restore();

    if (blendShapesRef.current && resultsRef.current && resultsRef.current.faceBlendshapes) {
      drawBlendShapes(blendShapesRef.current, resultsRef.current.faceBlendshapes);
    }

    if (webcamRunning.current) {
      requestAnimationFrame(predictWebcam);
    }
  }

  function drawBlendShapes(el: HTMLElement, blendShapes: any[]) {
    if (!blendShapes || !blendShapes.length || !blendShapes[0]?.categories) {
      el.innerHTML = "";
      return;
    }

    let htmlMaker = "";
    blendShapes[0].categories.map((shape: { displayName: string; categoryName: string; score: number }) => {
      htmlMaker += `
        <li class="blend-shapes-item">
          <span class="blend-shapes-label">${shape.displayName || shape.categoryName}</span>
          <span class="blend-shapes-value" style="width: calc(${
            +shape.score * 100
          }% - 120px)">${(+shape.score).toFixed(4)}</span>
        </li>
      `;
    });

    el.innerHTML = htmlMaker;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <main className="p-8 rounded-lg shadow-md bg-white flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-4 text-center">Face Landmarker</h1>
        {hasCameraPermission === true && stream ? (
          <div className="relative">
            <video
              ref={videoRef}
              className="w-[480px] h-[360px] rounded-md bg-black object-fit-cover"
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={setCanvasRef}
              className="absolute top-0 left-0 w-[480px] h-[360px] rounded-md"
              style={{ zIndex: 1 }}
            />
          </div>
        ) : (
          <p className="text-center text-gray-600">Camera access not available.</p>
        )}
        {isLandmarkerReady ? (
          <p className="mt-4 text-green-500 text-center">Face Landmarker Ready</p>
        ) : (
          <p className="mt-4 text-yellow-500 text-center">Initializing Face Landmarker...</p>
        )}
        <div ref={blendShapesRef} className="mt-4 w-full max-w-md">
          <h2 className="text-lg font-semibold mb-2">Blend Shapes</h2>
          <ul className="list-none p-0">
            {/* Blend shape data will be rendered here */}
          </ul>
        </div>
      </main>
    </div>
  );
}