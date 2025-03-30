"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";

export const useCountdown = (
  targetTimestamp: number
): { 
  time: string; 
  isComplete: boolean;
  isEndingSoon: boolean; 
  timeLeftMs: number;
} => {
  const [timeLeft, setTimeLeft] = useState<number>();
  const [isEndingSoon, setIsEndingSoon] = useState(false);
  const hasTriggeredEndingSoon = useRef(false);
  
  // Convert the input timestamp (seconds) to milliseconds.
  const targetTime = targetTimestamp * 1000;
  
  // CONSTANTS
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Helper function to calculate the remaining time (in ms).
  const calculateTimeLeft = () => targetTime - Date.now();

  useEffect(() => {
    // Reset the endingSoon state and ref when target time changes
    setIsEndingSoon(false);
    hasTriggeredEndingSoon.current = false;
    
    // Set an interval to update the time left every second.
    const intervalId = setInterval(() => {
      if (targetTimestamp !== 0) {
        const remainingMs = calculateTimeLeft();
        setTimeLeft(remainingMs);
        
        // Check if we've reached the 5-minute mark
        if (remainingMs > 0 && remainingMs <= FIVE_MINUTES_MS && !hasTriggeredEndingSoon.current) {
          setIsEndingSoon(true);
          hasTriggeredEndingSoon.current = true;
        }
      }
    }, 1000);

    // Cleanup interval on unmount.
    return () => clearInterval(intervalId);
  }, [targetTime]);

  if (timeLeft === undefined) {
    const time = "00:00:00";
    return { time, isComplete: false, isEndingSoon: false, timeLeftMs: 0 };
  } else {
    if (timeLeft <= 0) {
      const time = "00:00:00";
      return { time, isComplete: true, isEndingSoon: false, timeLeftMs: 0 };
    }

    // Calculate days, hours, minutes, and seconds.
    // const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    // Helper function to pad numbers to two digits.
    const padNumber = (num: number): string => num.toString().padStart(2, "0");

    let time = `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(
      seconds
    )}`;

    if (targetTimestamp === 0) {
      time = "00:00:00";
    }

    return { 
      time, 
      isComplete: false, 
      isEndingSoon, 
      timeLeftMs: timeLeft 
    };
  }
};
