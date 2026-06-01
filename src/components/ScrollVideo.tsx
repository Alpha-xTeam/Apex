import React, { useEffect, useState } from 'react';

const TOTAL_FRAMES = 9;
const FRAME_DURATION = 100; // Duration for each frame in milliseconds (100ms = 10 frames per second)

const getFramePath = (index: number) => {
  const paddedIndex = String(index).padStart(3, '0');
  return `/hero photos/ezgif-frame-${paddedIndex}.jpg`;
};

export const ScrollVideo: React.FC = () => {
  const [activeFrame, setActiveFrame] = useState(0);
  const [preloaded, setPreloaded] = useState(false);

  // 1. Preload all 9 frames on mount
  useEffect(() => {
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = getFramePath(i);
      img.onload = () => {
        loadedCount++;
        if (loadedCount === TOTAL_FRAMES) {
          setPreloaded(true);
        }
      };
      images.push(img);
    }
  }, []);

  // 2. Play the animation exactly once on mount, then freeze on the last frame
  useEffect(() => {
    if (!preloaded) return;

    let currentFrame = 0;

    const interval = setInterval(() => {
      if (currentFrame >= TOTAL_FRAMES - 1) {
        clearInterval(interval); // Freeze on the last frame (Frame 9)
        return;
      }

      currentFrame++;
      setActiveFrame(currentFrame);
    }, FRAME_DURATION);

    return () => clearInterval(interval);
  }, [preloaded]);

  return (
    <div className="scroll-video-wrapper">
      {/* 
        Render all 9 preloaded frames stacked in DOM. 
        Only the active frame is visible, playing in an automatic seamless loop.
      */}
      {Array.from({ length: TOTAL_FRAMES }).map((_, index) => (
        <img
          key={index}
          src={getFramePath(index + 1)}
          alt={`Frame ${index + 1}`}
          className={`scroll-background-frame ${preloaded && index === activeFrame ? 'active' : ''}`}
        />
      ))}
      <div className="grain-overlay" />
      <div className="vignette-overlay" />
    </div>
  );
};
