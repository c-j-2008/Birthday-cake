/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

type Scene = 'cake' | 'reveal' | 'countdown' | 'gift' | 'letter';


const STORAGE_KEY = 'giftUnlockTime';
const COUNTDOWN_DURATION =   7200000; // 7 hours
const REVEAL_DURATION = 4000; // 4 seconds
const LOADING_MESSAGE_INTERVAL = 4000; // 4 seconds

const LOADING_MESSAGES = [
    '🌙 Moon Girl detected...',
    '💖 Wrapping something special...',
    '✨ Collecting birthday magic...',
    '🎁 Your surprise is being prepared...',
    '🌸 Adding extra cuteness...',
    '💌 Sealing a heartfelt message...',
    '⭐ Sprinkling a little stardust...',
    '❤️ Loading precious memories...',
    '🎀 Tying the final ribbon...',
    '🌷 Making this gift perfect for you...',
    '🌙 The moon approves this surprise...',
    '✨ Polishing every little detail...',
    '💖 Filling the gift with love...',
    '🎁 Almost ready... but not yet...',
    '🌸 Gathering warm birthday wishes...',
    '💌 Protecting the surprise until the timer ends...',
    '⭐ A very special letter is waiting...',
    '❤️ Counting down to something meaningful...',
    '🌙 The gift chamber remains sealed...',
    '✨ Your surprise is getting closer every second...',
];

const LAST_MINUTE_MESSAGES = [
    '⏳ Less than a minute remains...',
    '💖 The gift is almost yours...',
    '🎁 Get ready...',
    '💌 The surprise awaits...',
];

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    gravity: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    alpha: number;
}

export default function App() {
    const [scene, setScene] = useState<Scene>('cake');
    const [timeLeft, setTimeLeft] = useState('02:00:00');
     const [timeRemainingMs, setTimeRemainingMs] = useState(COUNTDOWN_DURATION);
    const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
    const [loadingMessageKey, setLoadingMessageKey] = useState(0);
    const loadingMessageIndexRef = useRef(0);
    const [hearts, setHearts] = useState<{ id: number; left: number; tx: number }[]>([]);
    const [isBlown, setIsBlown] = useState(false);
    const [isMicActive, setIsMicActive] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [volume, setVolume] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);

    const particlesRef = useRef<Particle[]>([]);
    const animationFrameRef = useRef<number>(0);
    const countdownIntervalRef = useRef<any>(null);
    const endTimeRef = useRef<number | null>(null);

    const birthdaySongRef = useRef<HTMLAudioElement>(null);
    const letterMusicRef = useRef<HTMLAudioElement>(null);


    // ============================================
    // MICROPHONE BLOW DETECTION
    // ============================================
    const startMic = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            audioContextRef.current = audioContext;
            
            const analyzer = audioContext.createAnalyser();
            // Use a larger fftSize for better time-domain resolution for blow detection
            analyzer.fftSize = 2048;
            // Slight smoothing to avoid too many false positives while still allowing breath detection
            analyzer.smoothingTimeConstant = 0.3;
            analyzerRef.current = analyzer;
            
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyzer);
            
            setIsMicActive(true);
            detectBlow();
        } catch (err) {
            console.error("Microphone access denied:", err);
            alert("Microphone access is required to blow out the candles!");
        }
    };

   const detectBlow = () => {
    if (!analyzerRef.current || isBlown) return;

       // Use both frequency and time-domain data to detect a blow (low-frequency burst)
       const freqArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
       analyzerRef.current.getByteFrequencyData(freqArray);

       // Time domain for peak/RMS detection
       const timeArray = new Uint8Array(analyzerRef.current.fftSize);
       analyzerRef.current.getByteTimeDomainData(timeArray);

       // Frequency average (0-255)
       let freqSum = 0;
       for (let i = 0; i < freqArray.length; i++) freqSum += freqArray[i];
       const freqAvg = freqSum / freqArray.length;

       // Time-domain RMS around center (128 is silence)
       let sumSquares = 0;
       let peak = 0;
       for (let i = 0; i < timeArray.length; i++) {
           const v = timeArray[i] - 128;
           sumSquares += v * v;
           peak = Math.max(peak, Math.abs(v));
       }
       const rms = Math.sqrt(sumSquares / timeArray.length);

       // Normalize metrics to roughly comparable ranges
       const normalizedRms = rms; // typical blow will produce larger RMS
       const normalizedFreq = freqAvg; // low-frequency energy

       // Update small visual meter (scale to 0-100)
       const meterValue = Math.min(100, Math.max(0, (normalizedRms * 1.2) + (normalizedFreq * 0.15)));
       setVolume(meterValue);

       // Sensitivity thresholds tuned for softer blows
       const RMS_THRESHOLD = 10; // lower value to detect softer breath
       const FREQ_THRESHOLD = 28; // fallback threshold
       const PEAK_THRESHOLD = 20; // quick peak detection

       if (normalizedRms > RMS_THRESHOLD || normalizedFreq > FREQ_THRESHOLD || peak > PEAK_THRESHOLD) {
           handleBlow();
           return;
       }

       requestAnimationFrame(detectBlow);
   };

    const handleBlow = () => {
        setIsBlown(true);
        setIsMicActive(false);
        
        // Stop the microphone
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }

        // Wait a moment then celebrate
        setTimeout(() => {
            handleCelebrate();
        }, 1000);
    };

    // ============================================
    // SCENE TRANSITION SYSTEM
    // ============================================
    const switchScene = (targetScene: Scene) => {
        setScene(targetScene);
    };

    // ============================================
    // CONFETTI & PARTICLE EFFECTS
    // ============================================
    const createConfetti = (count = 200) => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
            // Spread confetti across entire canvas for a "filling the screen" effect
            for (let i = 0; i < count; i++) {
                const startX = Math.random() * canvas.width;
                const startY = Math.random() * canvas.height;

                // Zero/low gravity and random velocity in all directions to simulate space-like motion
                particlesRef.current.push({
                    x: startX,
                    y: startY,
                    vx: (Math.random() - 0.5) * 8, // gentle sideways speed
                    vy: (Math.random() - 0.5) * 8, // gentle up/down speed
                    gravity: 0.0, // no gravity (space-like)
                    size: Math.random() * 12 + 4,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.2,
                    color: [
                        '#ff4fa3',
                        '#ff8cc8',
                        '#ffb3d9',
                        '#ffd1ea',
                        '#ffffff',
                    ][Math.floor(Math.random() * 5)],
                    alpha: 1,
                });
            }
        };

    const createFloatingHearts = (count = 15) => {
            // Create hearts spread across the bottom and also rising/flowing across the screen
            const newHearts = Array.from({ length: count }).map((_, i) => ({
                id: Date.now() + i,
                left: Math.random() * window.innerWidth,
                tx: (Math.random() - 0.5) * (window.innerWidth * 0.6),
            }));
            setHearts(prev => [...prev, ...newHearts]);
            // Keep hearts longer so they can float across most of the screen
            setTimeout(() => {
                setHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
            }, 6000);
        };

    const animateConfetti = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Remove fully faded particles
            particlesRef.current = particlesRef.current.filter(p => p.alpha > 0.02);

            particlesRef.current.forEach(p => {
                // Gentle space-like drift (no gravity), but keep a tiny randomness
                p.vx += (Math.random() - 0.5) * 0.06;
                p.vy += (Math.random() - 0.5) * 0.06 + p.gravity; // gravity usually 0

                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;

                // Bounce off edges with damping so confetti hits edges and flows away
                const bounceDamping = 0.75;
                if (p.x <= 0) {
                    p.x = 0;
                    p.vx = Math.abs(p.vx) * bounceDamping;
                } else if (p.x >= canvas.width) {
                    p.x = canvas.width;
                    p.vx = -Math.abs(p.vx) * bounceDamping;
                }
                if (p.y <= 0) {
                    p.y = 0;
                    p.vy = Math.abs(p.vy) * bounceDamping;
                } else if (p.y >= canvas.height) {
                    p.y = canvas.height;
                    p.vy = -Math.abs(p.vy) * bounceDamping;
                }

                // Fade slowly so they can fill screen
                p.alpha -= 0.007;

                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });

            animationFrameRef.current = requestAnimationFrame(animateConfetti);
        };

    // ============================================
    // COUNTDOWN LOGIC
    // ============================================
    const formatTime = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        return (
            String(hours).padStart(2, '0') +
            ':' +
            String(minutes).padStart(2, '0') +
            ':' +
            String(seconds).padStart(2, '0')
        );
    };

    const updateCountdown = () => {
        if (endTimeRef.current === null) return;
        const timeRemaining = endTimeRef.current - Date.now();

        if (timeRemaining <= 0) {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
            setTimeLeft('00:00:00');
            
            switchScene('gift');
            return;
        }

         setTimeRemainingMs(timeRemaining);
        setTimeLeft(formatTime(timeRemaining));
    };

    const startCountdown = () => {
        const stored = localStorage.getItem(STORAGE_KEY);

            // If an end time exists in the URL hash (shared link), prefer it so different devices can use the same countdown
            const hashMatch = typeof location !== 'undefined' && location.hash.match(/t=(\d+)/);
            const hashTime = hashMatch ? Number(hashMatch[1]) : null;

            if (stored) {
                endTimeRef.current = Number(stored);
            } else if (hashTime) {
                endTimeRef.current = hashTime;
                localStorage.setItem(STORAGE_KEY, String(hashTime));
            } else {
                // Only create a new end time if none exists anywhere
                endTimeRef.current = Date.now() + COUNTDOWN_DURATION;
                // Persist to localStorage and to the URL hash so other devices can open the same timer
                localStorage.setItem(STORAGE_KEY, String(endTimeRef.current));
                try {
                    history.replaceState(null, '', '#t=' + String(endTimeRef.current));
                } catch (e) {
                    // ignore
                }
            }

            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }

            updateCountdown();
            countdownIntervalRef.current = setInterval(updateCountdown, 1000);
        };

    // ============================================
    // HANDLERS
    // ============================================
    const handleCelebrate = () => {
        if (birthdaySongRef.current) {
            birthdaySongRef.current.currentTime = 0;
            birthdaySongRef.current.play().catch(err => console.warn('Audio play failed:', err));
        }

        switchScene('reveal');
            // Make the celebration more dramatic: many confetti and hearts that fill the screen
            createConfetti(450);
            createFloatingHearts(80);

            // Allow confetti/hearts to fill the screen a bit longer before returning to countdown
            setTimeout(() => {
                switchScene('countdown');
                startCountdown();
            }, REVEAL_DURATION + 1200);
        };

    const handleGiftClick = () => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }

        if (birthdaySongRef.current) {
            birthdaySongRef.current.pause();
        }

        switchScene('letter');

        if (letterMusicRef.current) {
            letterMusicRef.current.currentTime = 0;
            letterMusicRef.current.play().catch(err => console.warn('Audio play failed:', err));
        }
    };

    const handleReset = () => {
    const password = prompt("Enter admin password");

    if (password === "1111") {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    } else if (password !== null) {
        alert("Wrong password");
    }
};

    // ============================================
    // LIFECYCLE
    // ============================================
    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        animateConfetti();

        // Pause/resume audio on tab visibility changes so music stops when navigating away
        const handleVisibility = () => {
            const hidden = document.hidden;
            if (hidden) {
                if (birthdaySongRef.current && !birthdaySongRef.current.paused) {
                    try { birthdaySongRef.current.pause(); } catch (e) {}
                }
                if (letterMusicRef.current && !letterMusicRef.current.paused) {
                    try { letterMusicRef.current.pause(); } catch (e) {}
                }
            } else {
                // resume only if scene suggests music should be playing
                try {
                    if (scene === 'reveal' || scene === 'gift') {
                        if (birthdaySongRef.current && birthdaySongRef.current.paused) birthdaySongRef.current.play().catch(() => {});
                    }
                    if (scene === 'letter') {
                        if (letterMusicRef.current && letterMusicRef.current.paused) letterMusicRef.current.play().catch(() => {});
                    }
                } catch (e) {}
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Auto-check on load (also check URL hash so timer can be shared across devices using the hash)
        const stored = localStorage.getItem(STORAGE_KEY);
        const hashMatch = typeof location !== 'undefined' && location.hash.match(/t=(\d+)/);
        const hashTime = hashMatch ? Number(hashMatch[1]) : null;

        if (stored || hashTime) {
            const endTime = stored ? Number(stored) : hashTime!;
            endTimeRef.current = endTime;
            const timeRemaining = endTime - Date.now();

            if (timeRemaining <= 0) {
                switchScene('gift');
            } else {
                switchScene('countdown');
                startCountdown();
            }
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', handleVisibility);
            cancelAnimationFrame(animationFrameRef.current);
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);
    
    // Rotating loading messages every 4 seconds during countdown
    useEffect(() => {
        if (scene !== 'countdown') return;

        const messages =
            timeRemainingMs <= 60000 ? LAST_MINUTE_MESSAGES : LOADING_MESSAGES;

        loadingMessageIndexRef.current = 0;
        setLoadingMessage(messages[0]);
        setLoadingMessageKey(prev => prev + 1);

        const advanceMessage = () => {
            loadingMessageIndexRef.current =
                (loadingMessageIndexRef.current + 1) % messages.length;
            setLoadingMessage(messages[loadingMessageIndexRef.current]);
            setLoadingMessageKey(prev => prev + 1);
        };

        const intervalId = setInterval(advanceMessage, LOADING_MESSAGE_INTERVAL);

        return () => clearInterval(intervalId);
    }, [scene, timeRemainingMs <= 60000]);

    return (
        <main>
            {/* Confetti & Effects Canvas */}
            <canvas id="confettiCanvas" ref={canvasRef}></canvas>

            {/* SCENE 1: CAKE & CELEBRATE BUTTON */}
            <section id="cakeScene" className={`scene ${scene === 'cake' ? 'active' : ''}`}>
                <div className={`cakeWrapper ${isBlown ? 'blown' : ''}`}>
                    {/* Cake Tier 3 (Top) */}
                    <div className="tier tier3">
                        <div className="candleContainer">
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                        </div>
                    </div>

                    {/* Cake Tier 2 (Middle) */}
                    <div className="tier tier2">
                        <div className="candleContainer">
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                        </div>
                    </div>

                    {/* Cake Tier 1 (Bottom) */}
                    <div className="tier tier1">
                        <div className="candleContainer">
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                        </div>
                    </div>

                    {/* Cake Base */}
                    <div className="cakeBase"></div>
                </div>

                <h1 className="heroTitle">Happy Birthday My Moon Girl 🌙</h1>

                {!isMicActive && !isBlown ? (
                    <button id="activateMicBtn" className="btn" onClick={startMic}>
                        🎤 Click to Blow!
                    </button>
                ) : isMicActive ? (
                    <div className="space-y-4 text-center">
                        <div className="text-pink-500 font-bold animate-pulse text-xl">
                            Now Blow into the Mic! 🌬️
                        </div>
                        <div className="w-48 h-2 bg-pink-100 rounded-full mx-auto overflow-hidden">
                            <div 
                                className="h-full bg-pink-500 transition-all duration-100" 
                               style={{ width: `${Math.min(volume * 2, 100)}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="text-pink-600 font-festive text-3xl animate-bounce">
                        Make a Wish! ✨
                    </div>
                )}
            </section>

            {/* SCENE 2: NAME REVEAL WITH CONFETTI & HEARTS */}
            <section id="revealScene" className={`scene ${scene === 'reveal' ? 'active' : ''}`}>
                <div className="revealContainer">
                    <h1 className="revealText">Happy Birthday</h1>
                    <h1 className="revealText nameText">My Moon Girl</h1>
                </div>
            </section>

            {/* SCENE 3: COUNTDOWN BEFORE GIFT UNLOCK */}
            <section id="countdownScene" className={`scene ${scene === 'countdown' ? 'active' : ''}`}>
                <div className="glassContainer">
                    <h2 className="countdownTitle">💖 Happy Birthday My Moon Girl 💖</h2>
                    <p className="countdownIntro">A special gift has been prepared just for you.</p>
                    <p className="countdownTeaser">But some surprises are worth waiting for..</p>
                    <div id="countdownTimer">{timeLeft}</div>
                          key={loadingMessageKey}
                     <p
                        className="loadingMessage"
                        aria-live="polite"
                    >
                        {loadingMessage}
                    </p>
                    <p className="subText">come back when timer hits zero</p>
        
                </div>
            </section>

            {/* SCENE 4: GIFT BOX TO OPEN */}
            <section id="giftScene" className={`scene ${scene === 'gift' ? 'active' : ''}`}>
                <div className="giftContainer">
                    <div className="box" id="giftBox" onClick={handleGiftClick}>🎁</div>
                    <p className="tapText">Tap to open your letter</p>
                </div>
            </section>

            {/* SCENE 5: LETTER REVEAL */}
            <section id="letterScene" className={`scene ${scene === 'letter' ? 'active' : ''}`}>
                <div className="letterCard">
                    <h2 className="letterTitle">💌 My Letter for You</h2>
                    <div className="letterContent" id="letterContent">
                        <p>
                            Dear My Moon Girl,
                            <br /><br />
                            Today is your special day, and I wanted to take a moment to tell you 
                            how much you mean to me. Your light brightens every day of my life, 
                            just like the moon lights up the night sky. 
                            <br /><br />
                            Every moment with you is a treasure, and I'm grateful for all the 
                            memories we've created together. Today, I celebrate you—your kindness, 
                            your beauty, and the incredible person you are.
                            <br /><br />
                            Happy Birthday to the most wonderful person I know. 
                            <br /><br />
                            Forever yours,
                            <br />
                            Your Loving One ❤️
                        </p>
                    </div>
                </div>
            </section>

            {/* AUDIO ELEMENTS */}
            <audio id="birthdaySong" ref={birthdaySongRef} src="https://files.catbox.moe/gv6wzm.mp3"></audio>
            <audio id="letterMusic" ref={letterMusicRef} src="https://files.catbox.moe/wfvt37.mp3"></audio>

            {/* RESET BUTTON */}
            <button id="resetBtn" className="resetBtn" title="Click to restart" onClick={handleReset}>🔄</button>

            {/* Hearts Overlay */}
            {hearts.map(heart => (
                <div 
                    key={heart.id} 
                    className="floatingHeart" 
                    style={{ left: heart.left, top: window.innerHeight - 50 + 'px', '--tx': heart.tx + 'px' } as any}
                >
                    💖
                </div>
            ))}
        </main>
    );
}

