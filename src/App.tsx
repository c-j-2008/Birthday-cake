/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

type Scene = 'cake' | 'reveal' | 'countdown' | 'gift' | 'letter';
type ParticleShape = 'square' | 'circle' | 'heart';

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
    shape: ParticleShape;
}

interface SpaceFloat {
    id: number;
    icon: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    spin: number;
}

const STORAGE_KEY = 'giftUnlockTime';
const UNLOCK_QUERY_KEY = 'unlock';
const COUNTDOWN_DURATION = 7200000; // 2 hours
const REVEAL_DURATION = 4000;
const LOADING_MESSAGE_INTERVAL = 4000;
const BLOW_RMS_THRESHOLD = 0.018;
const BLOW_FREQUENCY_THRESHOLD = 7;
const BLOW_FRAMES_REQUIRED = 2;

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

export default function App() {
    const [scene, setScene] = useState<Scene>('cake');
    const [timeLeft, setTimeLeft] = useState('02:00:00');
    const [timeRemainingMs, setTimeRemainingMs] = useState(COUNTDOWN_DURATION);
    const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
    const [loadingMessageKey, setLoadingMessageKey] = useState(0);
    const [hearts, setHearts] = useState<{ id: number; left: number; tx: number; size: number; delay: number }[]>([]);
    const [spaceFloats, setSpaceFloats] = useState<SpaceFloat[]>([]);
    const [isBlown, setIsBlown] = useState(false);
    const [isMicActive, setIsMicActive] = useState(false);
    const [volume, setVolume] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const birthdaySongRef = useRef<HTMLAudioElement>(null);
    const letterMusicRef = useRef<HTMLAudioElement>(null);
    const loadingMessageIndexRef = useRef(0);
    const particlesRef = useRef<Particle[]>([]);
    const spaceFloatsRef = useRef<SpaceFloat[]>([]);
    const animationFrameRef = useRef<number>(0);
    const spaceFrameRef = useRef<number>(0);
    const micFrameRef = useRef<number>(0);
    const countdownIntervalRef = useRef<number>(0);
    const endTimeRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const blowFrameCountRef = useRef(0);
    const activeAudioRef = useRef<HTMLAudioElement | null>(null);
    const shouldResumeAudioRef = useRef(false);

    const stopMic = () => {
        cancelAnimationFrame(micFrameRef.current);
        micStreamRef.current?.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
        audioContextRef.current?.close().catch(() => undefined);
        audioContextRef.current = null;
        analyzerRef.current = null;
    };

    const handleBlow = () => {
        setIsBlown(true);
        setIsMicActive(false);
        blowFrameCountRef.current = 0;
        stopMic();

        window.setTimeout(() => {
            handleCelebrate();
        }, 700);
    };

    const detectBlow = () => {
        if (!analyzerRef.current || isBlown) return;

        const frequencyData = new Uint8Array(analyzerRef.current.frequencyBinCount);
        const timeData = new Uint8Array(analyzerRef.current.fftSize);
        analyzerRef.current.getByteFrequencyData(frequencyData);
        analyzerRef.current.getByteTimeDomainData(timeData);

        const average = frequencyData.reduce((total, value) => total + value, 0) / frequencyData.length;
        const squareAverage = timeData.reduce((total, value) => {
            const normalized = (value - 128) / 128;
            return total + normalized * normalized;
        }, 0) / timeData.length;
        const rms = Math.sqrt(squareAverage);

        setVolume(Math.min(100, Math.max(average * 5, rms * 260)));

        if (average > BLOW_FREQUENCY_THRESHOLD || rms > BLOW_RMS_THRESHOLD) {
            blowFrameCountRef.current += 1;
        } else {
            blowFrameCountRef.current = 0;
        }

        if (blowFrameCountRef.current >= BLOW_FRAMES_REQUIRED) {
            handleBlow();
            return;
        }

        micFrameRef.current = requestAnimationFrame(detectBlow);
    };

    const startMic = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true,
                },
            });
            micStreamRef.current = stream;

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const analyzer = audioContext.createAnalyser();
            analyzer.fftSize = 512;
            analyzer.smoothingTimeConstant = 0.35;

            audioContext.createMediaStreamSource(stream).connect(analyzer);
            audioContextRef.current = audioContext;
            analyzerRef.current = analyzer;

            setIsMicActive(true);
            blowFrameCountRef.current = 0;
            micFrameRef.current = requestAnimationFrame(detectBlow);
        } catch (err) {
            console.error('Microphone access denied:', err);
            alert('Microphone access is required to blow out the candles!');
        }
    };

    const createConfetti = (count = 200, fillScreen = false) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const colors = ['#ff4fa3', '#ff8cc8', '#ffb3d9', '#ffd1ea', '#fff0f7', '#ffffff'];

        for (let i = 0; i < count; i++) {
            const originX = fillScreen ? Math.random() * canvas.width : canvas.width / 2;
            const originY = fillScreen ? canvas.height + Math.random() * canvas.height * 0.45 : canvas.height / 3;
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * (fillScreen ? 1.05 : 0.8);
            const speed = fillScreen ? 8 + Math.random() * 18 : 8 + Math.random() * 10;

            particlesRef.current.push({
                x: originX,
                y: originY,
                vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 5,
                vy: Math.sin(angle) * speed - Math.random() * 6,
                gravity: fillScreen ? 0.035 : 0.12,
                size: Math.random() * 10 + 4,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.22,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                shape: Math.random() > 0.8 ? 'heart' : Math.random() > 0.55 ? 'circle' : 'square',
            });
        }
    };

    const createFloatingHearts = (count = 40) => {
        const newHearts = Array.from({ length: count }).map((_, i) => ({
            id: Date.now() + i,
            left: Math.random() * window.innerWidth,
            tx: (Math.random() - 0.5) * window.innerWidth,
            size: 18 + Math.random() * 28,
            delay: Math.random() * 0.7,
        }));

        setHearts(prev => [...prev, ...newHearts]);
        window.setTimeout(() => {
            setHearts(prev => prev.filter(heart => !newHearts.some(newHeart => newHeart.id === heart.id)));
        }, 5600);
    };

    const animateConfetti = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesRef.current = particlesRef.current.filter(particle => particle.alpha > 0);

        particlesRef.current.forEach(particle => {
            particle.vy += particle.gravity;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            particle.alpha -= 0.008;

            ctx.save();
            ctx.globalAlpha = particle.alpha;
            ctx.fillStyle = particle.color;
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);

            if (particle.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (particle.shape === 'heart') {
                ctx.font = `${particle.size * 2}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('♥', 0, 0);
            } else {
                ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
            }

            ctx.restore();
        });

        animationFrameRef.current = requestAnimationFrame(animateConfetti);
    };

    const seedSpaceFloats = () => {
        const icons = ['💖', '🌸', '🎀', '✨', '🌙', '💗', '⭐'];
        const width = window.innerWidth || 390;
        const height = window.innerHeight || 780;

        spaceFloatsRef.current = Array.from({ length: width < 520 ? 15 : 24 }).map((_, id) => ({
            id,
            icon: icons[id % icons.length],
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 2.4 || 1.1,
            vy: (Math.random() - 0.5) * 2.4 || -1.1,
            size: 18 + Math.random() * (width < 520 ? 14 : 22),
            rotation: Math.random() * 360,
            spin: (Math.random() - 0.5) * 1.1,
        }));
        setSpaceFloats([...spaceFloatsRef.current]);
    };

    const animateSpaceFloats = () => {
        const width = window.innerWidth || 390;
        const height = window.innerHeight || 780;

        spaceFloatsRef.current.forEach(float => {
            float.vx += Math.sin(Date.now() * 0.0007 + float.id) * 0.006;
            float.vy += Math.cos(Date.now() * 0.0008 + float.id) * 0.006;
            float.x += float.vx;
            float.y += float.vy;
            float.rotation += float.spin;

            const radius = float.size / 2;
            if (float.x < radius || float.x > width - radius) {
                float.x = Math.max(radius, Math.min(width - radius, float.x));
                float.vx *= -0.96;
            }
            if (float.y < radius || float.y > height - radius) {
                float.y = Math.max(radius, Math.min(height - radius, float.y));
                float.vy *= -0.96;
            }

            const speed = Math.hypot(float.vx, float.vy);
            if (speed < 0.55) {
                float.vx += (Math.random() - 0.5) * 0.4;
                float.vy += (Math.random() - 0.5) * 0.4;
            }
            if (speed > 2.9) {
                float.vx *= 0.985;
                float.vy *= 0.985;
            }
        });

        setSpaceFloats(spaceFloatsRef.current.map(float => ({ ...float })));
        spaceFrameRef.current = requestAnimationFrame(animateSpaceFloats);
    };

    const formatTime = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const getSharedUnlockTime = () => {
        const params = new URLSearchParams(window.location.search);
        const urlUnlockTime = Number(params.get(UNLOCK_QUERY_KEY));
        const storedUnlockTime = Number(localStorage.getItem(STORAGE_KEY));

        if (Number.isFinite(urlUnlockTime) && urlUnlockTime > 0) {
            localStorage.setItem(STORAGE_KEY, String(urlUnlockTime));
            return urlUnlockTime;
        }

        if (Number.isFinite(storedUnlockTime) && storedUnlockTime > 0) {
            return storedUnlockTime;
        }

        return null;
    };

    const syncUnlockTimeToUrl = (unlockTime: number) => {
        const url = new URL(window.location.href);
        url.searchParams.set(UNLOCK_QUERY_KEY, String(unlockTime));
        window.history.replaceState(null, '', url);
    };

    const updateCountdown = () => {
        if (endTimeRef.current === null) return;
        const timeRemaining = endTimeRef.current - Date.now();

        if (timeRemaining <= 0) {
            window.clearInterval(countdownIntervalRef.current);
            setTimeLeft('00:00:00');
            setScene('gift');
            return;
        }

        setTimeRemainingMs(timeRemaining);
        setTimeLeft(formatTime(timeRemaining));
    };

    const startCountdown = () => {
        endTimeRef.current = getSharedUnlockTime() ?? Date.now() + COUNTDOWN_DURATION;
        localStorage.setItem(STORAGE_KEY, String(endTimeRef.current));
        syncUnlockTimeToUrl(endTimeRef.current);

        window.clearInterval(countdownIntervalRef.current);
        updateCountdown();
        countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);
    };

    const handleCelebrate = () => {
        if (birthdaySongRef.current) {
            birthdaySongRef.current.currentTime = 0;
            birthdaySongRef.current.play().catch(err => console.warn('Audio play failed:', err));
            activeAudioRef.current = birthdaySongRef.current;
        }

        setScene('reveal');
        createConfetti(560, true);
        createFloatingHearts(48);

        window.setTimeout(() => {
            setScene('countdown');
            startCountdown();
        }, REVEAL_DURATION);
    };

    const handleGiftClick = () => {
        window.clearInterval(countdownIntervalRef.current);
        birthdaySongRef.current?.pause();

        setScene('letter');
        if (letterMusicRef.current) {
            letterMusicRef.current.currentTime = 0;
            letterMusicRef.current.play().catch(err => console.warn('Audio play failed:', err));
            activeAudioRef.current = letterMusicRef.current;
        }
    };

    const handleReset = () => {
        const password = prompt('Enter admin password');
        if (password === '1111') {
            localStorage.removeItem(STORAGE_KEY);
            const url = new URL(window.location.href);
            url.searchParams.delete(UNLOCK_QUERY_KEY);
            window.history.replaceState(null, '', url);
            window.location.reload();
        } else if (password !== null) {
            alert('Wrong password');
        }
    };

    useEffect(() => {
        const handleResize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
            if (scene === 'countdown') {
                seedSpaceFloats();
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        animateConfetti();

        const unlockTime = getSharedUnlockTime();
        if (unlockTime) {
            endTimeRef.current = unlockTime;
            if (unlockTime <= Date.now()) {
                setScene('gift');
            } else {
                setScene('countdown');
                startCountdown();
            }
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameRef.current);
            cancelAnimationFrame(spaceFrameRef.current);
            stopMic();
            window.clearInterval(countdownIntervalRef.current);
        };
    }, []);

    useEffect(() => {
        if (scene !== 'countdown') {
            cancelAnimationFrame(spaceFrameRef.current);
            setSpaceFloats([]);
            spaceFloatsRef.current = [];
            return;
        }

        seedSpaceFloats();
        spaceFrameRef.current = requestAnimationFrame(animateSpaceFloats);
        return () => cancelAnimationFrame(spaceFrameRef.current);
    }, [scene]);

    useEffect(() => {
        if (scene !== 'countdown') return;

        const messages = timeRemainingMs <= 60000 ? LAST_MINUTE_MESSAGES : LOADING_MESSAGES;
        loadingMessageIndexRef.current = 0;
        setLoadingMessage(messages[0]);
        setLoadingMessageKey(prev => prev + 1);

        const intervalId = window.setInterval(() => {
            loadingMessageIndexRef.current = (loadingMessageIndexRef.current + 1) % messages.length;
            setLoadingMessage(messages[loadingMessageIndexRef.current]);
            setLoadingMessageKey(prev => prev + 1);
        }, LOADING_MESSAGE_INTERVAL);

        return () => window.clearInterval(intervalId);
    }, [scene, timeRemainingMs <= 60000]);

    useEffect(() => {
        const pauseAudio = () => {
            const audio = activeAudioRef.current;
            shouldResumeAudioRef.current = Boolean(audio && !audio.paused);
            audio?.pause();
        };

        const resumeAudio = () => {
            const audio = activeAudioRef.current;
            if (document.visibilityState === 'visible' && shouldResumeAudioRef.current && audio) {
                audio.play().catch(err => console.warn('Audio resume failed:', err));
                shouldResumeAudioRef.current = false;
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') pauseAudio();
            else resumeAudio();
        };

        window.addEventListener('pagehide', pauseAudio);
        window.addEventListener('pageshow', resumeAudio);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pagehide', pauseAudio);
            window.removeEventListener('pageshow', resumeAudio);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return (
        <main>
            <canvas id="confettiCanvas" ref={canvasRef}></canvas>

            <section id="cakeScene" className={`scene ${scene === 'cake' ? 'active' : ''}`}>
                <div className={`cakeWrapper ${isBlown ? 'blown' : ''}`}>
                    <div className="tier tier3">
                        <div className="candleContainer">
                            <div className="candle">
                                <div className="flame"></div>
                            </div>
                        </div>
                    </div>

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

                    <div className="cakeBase"></div>
                </div>

                <h1 className="heroTitle">Happy Birthday My Moon Girl 🌙</h1>

                {!isMicActive && !isBlown ? (
                    <button id="activateMicBtn" className="btn" onClick={startMic}>
                        🎤 Click to Blow!
                    </button>
                ) : isMicActive ? (
                    <div className="micPanel">
                        <div className="micText">Now blow gently into the mic! 🌬️</div>
                        <div className="micMeter">
                            <div className="micMeterFill" style={{ width: `${Math.min(volume, 100)}%` }} />
                        </div>
                    </div>
                ) : (
                    <div className="wishText">Make a Wish! ✨</div>
                )}
            </section>

            <section id="revealScene" className={`scene ${scene === 'reveal' ? 'active' : ''}`}>
                <div className="revealContainer">
                    <h1 className="revealText">Happy Birthday</h1>
                    <h1 className="revealText nameText">My Moon Girl</h1>
                </div>
            </section>

            <section id="countdownScene" className={`scene ${scene === 'countdown' ? 'active' : ''}`}>
                <div className="countdownAmbience" aria-hidden="true">
                    <div className="countdownGlow countdownGlow1"></div>
                    <div className="countdownGlow countdownGlow2"></div>
                    {spaceFloats.map(float => (
                        <span
                            key={float.id}
                            className="physicsFloat"
                            style={{
                                '--x': `${float.x}px`,
                                '--y': `${float.y}px`,
                                '--size': `${float.size}px`,
                                '--rotation': `${float.rotation}deg`,
                            } as CSSProperties}
                        >
                            {float.icon}
                        </span>
                    ))}
                </div>

                <div className="glassContainer">
                    <h2 className="countdownTitle">💖 Happy Birthday My Moon Girl 💖</h2>
                    <p className="countdownIntro">A special gift has been prepared just for you.</p>
                    <p className="countdownTeaser">But some surprises are worth waiting for..</p>
                    <div className="timerStage">
                        <div className="timerOrbit timerOrbitOuter"></div>
                        <div className="timerOrbit timerOrbitInner"></div>
                        <div id="countdownTimer">{timeLeft}</div>
                    </div>
                    <p key={loadingMessageKey} className="loadingMessage" aria-live="polite">
                        {loadingMessage}
                    </p>
                    <p className="subText">come back when timer hits zero</p>
                </div>
            </section>

            <section id="giftScene" className={`scene ${scene === 'gift' ? 'active' : ''}`}>
                <div className="giftContainer">
                    <button className="box" id="giftBox" onClick={handleGiftClick} aria-label="Open your letter">
                        🎁
                    </button>
                    <p className="tapText">Tap to open your letter</p>
                </div>
            </section>

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
                            memories we've created together. Today, I celebrate you-your kindness,
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

            <audio id="birthdaySong" ref={birthdaySongRef} src="https://files.catbox.moe/gv6wzm.mp3"></audio>
            <audio id="letterMusic" ref={letterMusicRef} src="https://files.catbox.moe/wfvt37.mp3"></audio>

            <button id="resetBtn" className="resetBtn" title="Click to restart" onClick={handleReset}>🔄</button>

            {hearts.map(heart => (
                <div
                    key={heart.id}
                    className="floatingHeart"
                    style={{
                        left: heart.left,
                        top: `${window.innerHeight + 40}px`,
                        '--tx': `${heart.tx}px`,
                        '--heart-size': `${heart.size}px`,
                        '--heart-delay': `${heart.delay}s`,
                    } as CSSProperties}
                >
                    💖
                </div>
            ))}
        </main>
    );
}
