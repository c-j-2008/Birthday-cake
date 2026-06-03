/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

type Scene = 'cake' | 'reveal' | 'countdown' | 'gift' | 'letter';

const STORAGE_KEY = 'giftUnlockTime';
const COUNTDOWN_DURATION =   1000; // 7 hours
const REVEAL_DURATION = 4000; // 4 seconds

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
    const [timeLeft, setTimeLeft] = useState('07:00:00');
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
            analyzer.fftSize = 256;
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
        
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setVolume(average);

        // Threshold for a "blow"
        if (average > 40) { 
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
        for (let i = 0; i < count; i++) {
            particlesRef.current.push({
                x: canvas.width / 2,
                y: canvas.height / 3,
                vx: (Math.random() - 0.5) * 12,
                vy: Math.random() * -14 - 8,
                gravity: 0.15,
                size: Math.random() * 8 + 3,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.15,
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
        const newHearts = Array.from({ length: count }).map((_, i) => ({
            id: Date.now() + i,
            left: Math.random() * window.innerWidth,
            tx: (Math.random() - 0.5) * 150,
        }));
        setHearts(prev => [...prev, ...newHearts]);
        setTimeout(() => {
            setHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
        }, 3000);
    };

    const animateConfetti = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particlesRef.current = particlesRef.current.filter(p => p.alpha > 0);

        particlesRef.current.forEach(p => {
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;

            p.alpha -= 0.01;

            ctx.save();
            ctx.globalAlpha = p.alpha;
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

        setTimeLeft(formatTime(timeRemaining));
    };

    const startCountdown = () => {
        const stored = localStorage.getItem(STORAGE_KEY);
        endTimeRef.current = stored ? Number(stored) : Date.now() + COUNTDOWN_DURATION;

        localStorage.setItem(STORAGE_KEY, String(endTimeRef.current));

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
        createConfetti(200);
        createFloatingHearts(15);

        setTimeout(() => {
            switchScene('countdown');
            startCountdown();
        }, REVEAL_DURATION);
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
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
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

        // Auto-check on load
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const endTime = Number(stored);
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
            cancelAnimationFrame(animationFrameRef.current);
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, []);

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
                    <h2>💖 Preparing Your Gift</h2>
                    <div id="countdownTimer">{timeLeft}</div>
                    <p className="subText">Stay on this page or come back later!</p>
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

