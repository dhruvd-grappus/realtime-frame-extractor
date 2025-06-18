// Styles
import "./tailwind.output.css";
import React, { useRef, useEffect, useState, useCallback } from "react";

// Main App component for the Video Thumbnail Extractor
const App = () => {
  // Ref for the visible video player
  const playerVideoRef = useRef(null);
  // Ref for the hidden video element used for thumbnail extraction
  const extractorVideoRef = useRef(null);
  // Ref for the canvas DOM element used for drawing frames
  const canvasRef = useRef(null);

  // State to store the generated thumbnail image data URLs
  const [thumbnails, setThumbnails] = useState([]);
  // State to manage loading message for thumbnails
  const [thumbnailLoading, setThumbnailLoading] = useState(true);
  // State to track if thumbnail extraction has started
  const [extractionStarted, setExtractionStarted] = useState(false);
  // State to indicate if a CORS error prevented thumbnail generation
  const [corsError, setCorsError] = useState(false);
  // How frequently to extract frames (in seconds)
  const FRAME_INTERVAL = 5;
  // Timeout for individual frame capture (in milliseconds)
  const CAPTURE_TIMEOUT_MS = 5000; // 5 seconds

  /**
   * Captures a frame from the hidden extractor video at a specific time
   * and adds it to the thumbnails state. Includes a timeout to prevent hanging.
   * @param {number} time - The time in seconds at which to capture the frame.
   * @returns {Promise<void>} A promise that resolves when the frame is captured or times out.
   */
  const captureFrameAt = useCallback((time) => {
    return new Promise((resolve) => {
      const video = extractorVideoRef.current; // Use the extractor video
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!video || !canvas || !ctx) {
        console.error(
          "CAPTURE_FRAME: Extractor video, canvas element, or context not available."
        );
        resolve(); // Resolve immediately if refs are missing
        return;
      }

      console.log(
        `CAPTURE_FRAME_START: Attempting to capture frame at ${time.toFixed(
          2
        )}s`
      );

      // Set the extractor video's current time to the desired frame time
      video.currentTime = time;

      let timeoutId = null; // To store the timeout reference

      const cleanupListeners = () => {
        video.removeEventListener("seeked", handleSeeked);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const handleSeeked = () => {
        cleanupListeners(); // Clean up listeners and timeout

        // Ensure the canvas dimensions are set based on the video's intrinsic size
        if (
          canvas.width === 0 ||
          canvas.height === 0 ||
          canvas.width !== video.videoWidth ||
          canvas.height !== video.videoHeight
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          console.log(
            `CANVAS_DIMENSIONS: Setting canvas to ${video.videoWidth}x${
              video.videoHeight
            } for time ${time.toFixed(2)}s`
          );
        }

        let imgDataUrl = "";
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          imgDataUrl = canvas.toDataURL("image/png");
          if (imgDataUrl.length < 100) {
            // Very small data URL indicates potential issue
            console.warn(
              `CAPTURE_FRAME_WARNING: Generated image data URL seems too small for time ${time.toFixed(
                2
              )}s. Length: ${imgDataUrl.length}.`
            );
          } else {
            // console.log(`CAPTURE_FRAME_SUCCESS: Generated image data URL for time ${time.toFixed(2)}s. Length: ${imgDataUrl.length}.`);
          }
        } catch (e) {
          if (e.name === "SecurityError") {
            console.error(
              `CAPTURE_FRAME_ERROR: SecurityError! Canvas is tainted due to cross-origin video without proper CORS headers. Cannot extract thumbnail at time ${time.toFixed(
                2
              )}s.`,
              e
            );
            setCorsError(true); // Set CORS error state
          } else {
            console.error(
              `CAPTURE_FRAME_ERROR: General error drawing to canvas or getting data URL at time ${time.toFixed(
                2
              )}s:`,
              e
            );
          }
          imgDataUrl = `https://placehold.co/${canvas.width || 160}x${
            canvas.height || 90
          }/ff0000/ffffff?text=Error`;
        }

        if (imgDataUrl) {
          setThumbnails((prevThumbnails) => [...prevThumbnails, imgDataUrl]);
        }
        console.log(
          `CAPTURE_FRAME_END: Captured frame at ${time.toFixed(2)}s.`
        );
        resolve();
      };

      // Set a timeout for the seeked event
      timeoutId = setTimeout(() => {
        cleanupListeners(); // Clean up listeners
        console.warn(
          `CAPTURE_FRAME_TIMEOUT: Seeked event timed out for time ${time.toFixed(
            2
          )}s. Skipping this frame.`
        );
        // Add a placeholder or handle skipped frame, and resolve to continue the loop
        setThumbnails((prevThumbnails) => [
          ...prevThumbnails,
          `https://placehold.co/160x90/808080/ffffff?text=Skipped+${time.toFixed(
            0
          )}s`,
        ]);
        resolve();
      }, CAPTURE_TIMEOUT_MS);

      // Add a one-time listener for the seeked event
      video.addEventListener("seeked", handleSeeked);
    });
  }, []); // No dependencies as refs and setThumbnails are stable, and CAPTURE_TIMEOUT_MS is a const

  /**
   * Extracts frames from the entire duration of the video using the hidden extractor video.
   */
  const extractAllFrames = useCallback(async () => {
    const video = extractorVideoRef.current; // Use the extractor video
    if (!video) {
      console.warn(
        "EXTRACT_ALL_FRAMES: Extractor video not available when trying to extract frames."
      );
      setThumbnailLoading(false);
      return;
    }

    setThumbnailLoading(true); // Set loading state to true while extraction is in progress
    setExtractionStarted(true); // Indicate that extraction has started
    setThumbnails([]); // Clear previous thumbnails for a fresh start
    setCorsError(false); // Reset CORS error state

    const duration = video.duration;
    console.log(
      "EXTRACT_ALL_FRAMES: Starting extraction. Video duration:",
      duration,
      "seconds."
    );

    if (isNaN(duration) || duration <= 0) {
      console.error(
        "EXTRACT_ALL_FRAMES: Video duration is not available or invalid. Cannot extract frames."
      );
      setThumbnailLoading(false);
      return;
    }

    // Set the canvas dimensions once based on the video's intrinsic size
    const canvas = canvasRef.current;
    if (canvas && video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(
        `EXTRACT_ALL_FRAMES: Initial canvas size set to ${video.videoWidth}x${video.videoHeight}`
      );
    } else {
      console.warn(
        "EXTRACT_ALL_FRAMES: Could not set initial canvas dimensions from video. Might be 0."
      );
    }

    for (let t = 0; t < duration; t += FRAME_INTERVAL) {
      // If a CORS error has already occurred, stop trying to extract frames
      if (corsError) {
        console.warn(
          "EXTRACT_ALL_FRAMES: Stopping extraction due to CORS error detected earlier."
        );
        break;
      }
      const timeToCapture = Math.min(t, duration - 0.001); // Ensure we don't seek past the end
      await captureFrameAt(timeToCapture);
    }
    setThumbnailLoading(false); // Clear loading state only after the entire loop finishes
    console.log(
      `EXTRACT_ALL_FRAMES: Finished extraction process. Final thumbnail count will be updated via state.`
    );
  }, [FRAME_INTERVAL, captureFrameAt, corsError]);

  // Effect hook for initializing the hidden extractor video and starting thumbnail extraction
  useEffect(() => {
    const extractorVideo = extractorVideoRef.current;
    const canvas = canvasRef.current; // Access canvas here to ensure it's available

    if (!extractorVideo || !canvas) {
      console.error("USE_EFFECT_INIT: Extractor video or canvas ref is null.");
      return;
    }

    const handleVideoReady = async () => {
      console.log(
        "USE_EFFECT_INIT: Extractor video ready state:",
        extractorVideo.readyState
      );
      // Ensure metadata is loaded and video is ready to play through
      if (extractorVideo.readyState >= 4) {
        // HAVE_ENOUGH_DATA or HAVE_FUTURE_DATA (canplaythrough implies this)
        console.log(
          "USE_EFFECT_INIT: Extractor video is ready for extraction (canplaythrough state reached)."
        );
        // Remove the listener to prevent multiple calls if video state changes again
        extractorVideo.removeEventListener("canplaythrough", handleVideoReady);
        extractorVideo.removeEventListener("loadedmetadata", handleVideoReady); // Also remove metadata listener

        // Add a small delay here for extra robustness before starting extraction
        // This gives the browser a moment after canplaythrough to fully prepare
        setTimeout(() => {
          extractAllFrames();
        }, 500); // 500ms delay
      } else if (extractorVideo.readyState >= 1) {
        // HAVE_METADATA
        // If loadedmetadata fires but not canplaythrough, wait for canplaythrough
        console.log(
          "USE_EFFECT_INIT: Extractor video metadata loaded, waiting for canplaythrough."
        );
      }
    };

    // Attach listeners for both loadedmetadata and canplaythrough
    extractorVideo.addEventListener("loadedmetadata", handleVideoReady);
    extractorVideo.addEventListener("canplaythrough", handleVideoReady);

    // Explicitly call load() to ensure the video source starts loading
    // and then attempt to play/pause to prime the media element
    const primeVideo = async () => {
      try {
        extractorVideo.load(); // Request the video to load its data
        // Attempting to play/pause immediately might help browser allocate resources
        await extractorVideo.play();
        extractorVideo.pause();
        console.log("USE_EFFECT_INIT: Extractor video primed with play/pause.");
      } catch (error) {
        console.warn(
          "USE_EFFECT_INIT: Error priming extractor video with play/pause (likely autoplay policy):",
          error
        );
      }
    };

    primeVideo(); // Call priming function

    // Initial check in case the video is already ready (e.g., cached)
    // This handles cases where the video might be ready very quickly
    if (extractorVideo.readyState >= 4) {
      handleVideoReady();
    }

    // Cleanup: Remove event listeners when component unmounts
    return () => {
      extractorVideo.removeEventListener("loadedmetadata", handleVideoReady);
      extractorVideo.removeEventListener("canplaythrough", handleVideoReady);
    };
  }, [extractAllFrames]); // Dependency: extractAllFrames

  // --- DEBUGGING EFFECT ---
  // This useEffect will log the thumbnails array every time it changes
  useEffect(() => {
    console.log(
      "THUMBNAILS_STATE_CHANGE: Current thumbnails array length:",
      thumbnails.length
    );
    if (thumbnails.length > 0) {
      // Log a snippet of the first thumbnail's data URL to confirm content
      console.log(
        "THUMBNAILS_STATE_CHANGE: First thumbnail src snippet:",
        thumbnails[0].substring(0, 50)
      );
    }
  }, [thumbnails]);
  // --- END DEBUGGING EFFECT ---

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-sans text-gray-800">
      <h1 className="text-3xl font-bold text-indigo-700 mb-6 rounded-lg p-2 text-center">
        Video Thumbnail Extractor & Player
      </h1>

      <div className="w-full max-w-4xl bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          Video Player
        </h2>
        {/* Visible and playable video element */}
        <video
          ref={playerVideoRef}
          src="https://cdn.subgen.co/upload/-UsEJ0AYnO9xi_uk9XKl9/others/EVq5t_PZ0SBPkQt2iTn1Q.mp4" // Replace with your video URL
          crossOrigin="anonymous"
          preload="auto"
          controls
          className="w-full h-auto rounded-lg shadow-md mb-4"
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* HIDDEN video element for thumbnail extraction ONLY */}
      <video
        ref={extractorVideoRef}
        src="https://cdn.subgen.co/upload/-UsEJ0AYnO9xi_uk9XKl9/others/EVq5t_PZ0SBPkQt2iTn1Q.mp4" // MUST be the same video URL
        crossOrigin="anonymous"
        preload="auto"
        className="hidden" // This video remains hidden
      >
        Your browser does not support the video tag.
      </video>

      {/* Hidden canvas element for drawing and capturing frames */}
      <canvas ref={canvasRef} className="hidden"></canvas>

      {/* Container for displaying the extracted thumbnails */}
      <div className="w-full max-w-4xl bg-white p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          Generated Thumbnails
        </h2>
        {/* Changed this div to be horizontally scrollable */}
        <div className="flex overflow-x-auto whitespace-nowrap pb-4">
          {/* Conditional rendering logic: */}
          {corsError ? (
            <p className="flex-none text-center text-red-600 font-semibold w-full">
              <span className="text-xl">⚠️ CORS Error Detected!</span>
              <br />
              Thumbnails cannot be generated from this video URL.
              <br />
              Please ensure the video host allows cross-origin requests (e.g.,
              provides 'Access-Control-Allow-Origin: *' header).
            </p>
          ) : thumbnails.length > 0 ? ( // Display thumbnails if any exist
            thumbnails.map((src, index) => (
              <div
                key={index}
                className="flex-shrink-0 flex flex-col items-center rounded-lg overflow-hidden shadow-md bg-gray-50 p-2 mr-4 last:mr-0"
              >
                <img
                  src={src}
                  alt={`Thumbnail ${index}`}
                  className="w-40 h-auto rounded-md object-cover transition-transform duration-200 hover:scale-105" // Fixed width for consistent display
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = `https://placehold.co/160x90/aabbcc/ffffff?text=Error`;
                    console.error(`Failed to load thumbnail ${index}`);
                  }}
                />
                <span className="text-sm text-gray-600 mt-2">
                  Frame {index + 1}
                </span>
              </div>
            ))
          ) : thumbnailLoading && extractionStarted ? ( // Show extracting message if loading and started, but no thumbnails yet
            <p className="flex-none text-center text-gray-500 w-full">
              Extracting thumbnails... Please wait as this may take a while for
              long videos. Your video player is fully functional.
            </p>
          ) : !extractionStarted ? ( // Show initializing message if not started yet
            <p className="flex-none text-center text-gray-500 w-full">
              Initializing video for thumbnail extraction.
            </p>
          ) : (
            // Fallback for when extraction is done but no thumbnails were generated (e.g., very short video, or all failed)
            <p className="flex-none text-center text-gray-500 w-full">
              No thumbnails generated. This could be due to a short video, an
              invalid URL, or a CORS issue. Check console for potential errors.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
