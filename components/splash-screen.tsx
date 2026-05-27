'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const VELVET = '#4A235A'

const VIEWBOX = '155 60 320 150'
const PATH_1 =
  'M370.114319,78.425552 C375.319824,79.991142 377.983307,83.978447 380.866882,87.587875 C386.915192,95.158676 391.515289,103.698166 396.679352,111.859169 C400.997864,118.683914 406.119232,124.741920 412.844971,129.341141 C416.126465,131.585129 419.382965,132.168472 423.117279,130.224808 C429.098083,127.111862 435.654968,125.746712 442.274017,124.932381 C447.861694,124.244942 453.022827,125.455017 456.258911,130.600281 C459.083130,135.090622 458.960083,139.756683 456.079346,144.261932 C454.381195,146.917740 451.965240,148.952988 448.858002,149.138046 C434.678833,149.982483 423.285828,156.904068 412.448334,165.233887 C404.363525,171.447983 396.002289,177.234024 385.765259,179.365463 C366.717072,183.331406 351.175140,176.623657 337.829041,163.406876 C336.887390,162.474380 336.057190,161.429962 335.156433,160.454865 C335.064819,160.355698 334.843658,160.376205 334.371674,160.273560 C330.726624,166.055054 327.167114,172.032486 323.283905,177.791641 C314.979858,190.107285 303.982208,198.284073 288.734222,199.875473 C281.157928,200.666183 270.551971,198.354019 265.817719,194.333939 C269.622498,193.052536 273.455444,193.810333 277.083557,192.719467 C292.126465,188.196457 301.049377,178.052277 304.344421,163.057724 C305.511200,157.748291 307.228882,152.874359 309.833557,148.189301 C314.612732,139.592926 319.485229,131.062119 325.650360,123.351944 C333.019012,114.136604 342.514221,108.474594 354.059875,106.046455 C357.915833,105.235512 360.798065,106.004166 363.234192,109.214958 C366.934357,114.091660 370.519287,119.003456 373.334412,124.955772 C368.105621,126.620750 363.059631,126.673622 358.552582,129.042267 C354.310852,131.271469 353.786530,133.646179 355.884094,137.772003 C364.082184,153.897446 382.316589,158.924728 395.030762,148.363693 C394.963898,148.050735 394.990540,147.554916 394.803894,147.454147 C387.120514,143.305786 382.591034,137.113373 379.798004,128.637100 C376.557220,118.801979 370.438171,110.221016 363.141846,102.768707 C355.686737,95.154190 346.956360,90.518669 335.782867,92.940102 C335.369019,93.029785 334.864380,92.700752 334.401764,92.566772 C337.528168,81.831573 353.990601,75.214638 370.114319,78.425552 M360.935669,169.658279 C369.601410,170.395950 376.438446,166.741089 383.673065,160.297012 C374.843292,160.796616 367.922516,159.000641 361.709991,154.733307 C355.617798,150.548599 351.470337,144.738419 348.566376,137.528336 C344.777344,141.845703 342.533691,145.913116 339.975189,149.768158 C338.545532,151.922333 338.839142,153.684387 340.235901,155.675400 C345.183105,162.727448 351.472504,167.805878 360.935669,169.658279 z'
const PATH_2 =
  'M174.430298,142.843460 C169.802292,138.929611 168.041153,134.409744 169.720062,128.819656 C171.381409,123.287933 175.553757,120.734009 180.904541,120.359390 C193.277237,119.493149 203.338181,113.729324 212.828247,106.335739 C220.434250,100.410004 227.992615,94.315186 237.332901,91.152489 C256.922241,84.519379 276.771637,90.101242 290.018097,105.948509 C290.644592,106.698029 291.350433,107.381218 292.037659,108.114838 C294.419037,107.434845 294.937866,105.345222 295.910736,103.716301 C301.548279,94.277115 306.919800,84.647881 315.576599,77.470917 C328.168762,67.031319 342.158020,64.388870 357.610596,69.930283 C358.386963,70.208694 359.132599,70.598938 359.842438,71.021378 C360.065277,71.154022 360.123779,71.562836 360.253967,71.850571 C359.975586,72.845100 359.123505,73.009171 358.309998,73.096733 C337.733734,75.311829 327.312164,88.369675 323.000488,107.147247 C321.612183,113.193474 318.897278,118.331207 316.009186,123.513695 C309.679688,134.871719 303.290649,146.229614 292.641815,154.328812 C291.449829,155.235428 290.253784,156.141708 289.011047,156.975830 C273.307465,167.516495 261.810669,163.197205 256.341949,144.423996 C260.928436,142.808319 265.919556,142.274673 270.161804,139.536621 C273.031921,137.684143 273.812866,135.974304 272.245422,132.636124 C265.054108,117.320786 250.739960,111.595139 236.487854,118.648285 C235.055573,119.357086 233.303940,119.808479 232.782684,121.686638 C232.924408,121.999413 232.978912,122.455582 233.202057,122.563683 C241.522247,126.594612 246.823654,132.654114 249.803452,141.829453 C253.101181,151.983734 259.328461,160.867767 267.501129,168.075058 C274.912323,174.610870 283.364471,177.634964 294.622284,174.423172 C289.825073,182.895645 283.393524,186.374985 275.836395,188.180710 C270.098511,189.551758 264.323273,189.368500 258.517853,188.251770 C252.725067,187.137451 249.304810,182.963654 246.231689,178.668762 C240.808929,171.090134 235.897430,163.147934 230.647766,155.442490 C226.493866,149.345383 221.631699,143.948349 215.219910,140.028549 C211.803101,137.939713 208.738083,137.428940 204.975616,139.310608 C199.147110,142.225525 192.832092,143.764496 186.376434,144.765274 C182.274643,145.401169 178.425232,145.010818 174.430298,142.843460 M262.886841,99.381416 C256.385254,100.424278 250.821884,103.187889 245.250946,108.641594 C253.399506,108.871758 259.933838,110.460602 265.727417,114.409447 C271.604523,118.415268 275.437561,124.205803 278.993866,130.458740 C283.165344,126.778831 285.525787,122.600487 287.771790,118.320511 C288.572479,116.794701 288.379150,115.442833 287.519836,114.096275 C281.954407,105.375366 274.889740,99.065697 262.886841,99.381416 z'

type Phase = 'entering' | 'absorbing' | 'revealing' | 'exiting' | 'done'

const T_ENTER  = 400
const T_ABSORB = 2000
const T_REVEAL = 1100
const T_EXIT   = 500

const SPARKLES = [
  { x: -130, y: -70,  delay: 0.10 },
  { x:  150, y: -50,  delay: 0.30 },
  { x:  -90, y:  90,  delay: 0.20 },
  { x:  110, y: 100,  delay: 0.45 },
  { x:  -50, y: -120, delay: 0.55 },
  { x:   70, y: -100, delay: 0.35 },
]

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>('entering')

  useEffect(() => {
    let acc = 0
    acc += T_ENTER;  const t1 = setTimeout(() => setPhase('absorbing'), acc)
    acc += T_ABSORB; const t2 = setTimeout(() => setPhase('revealing'), acc)
    acc += T_REVEAL; const t3 = setTimeout(() => setPhase('exiting'),   acc)
    acc += T_EXIT;   const t4 = setTimeout(() => setPhase('done'),      acc)
    return () => { [t1, t2, t3, t4].forEach(clearTimeout) }
  }, [])

  if (phase === 'done') return null

  const drained  = phase === 'absorbing' || phase === 'revealing' || phase === 'exiting'
  const showText = phase === 'revealing' || phase === 'exiting'
  const exiting  = phase === 'exiting'

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: '#ffffff' }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: T_EXIT / 1000, ease: 'easeInOut' }}
    >
      {/* Defs globais: filtros e clip-path da logo */}
      <svg className="absolute" style={{ width: 0, height: 0 }} aria-hidden>
        <defs>
          {/* Borda do drain externo (turbulence estática, sem flicker) */}
          <filter id="splash-drain" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" />
            <feDisplacementMap in="SourceGraphic" scale="8" />
          </filter>

          {/* Líquido por DENTRO da logo: turbulence anima continuamente, scale decai */}
          <filter id="splash-inside" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="13">
              <animate
                attributeName="baseFrequency"
                values="0.025;0.055;0.03;0.04;0.025"
                dur="2.2s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="14">
              <animate
                attributeName="scale"
                values="16;10;5;2"
                keyTimes="0;0.4;0.75;1"
                dur={`${T_ABSORB / 1000}s`}
                begin={`${T_ENTER / 1000}s`}
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>

          {/* Forma da logo como clip-path — prende o líquido lá dentro */}
          <clipPath id="velvet-clip">
            <path d={PATH_1} />
            <path d={PATH_2} />
          </clipPath>
        </defs>
      </svg>

      {/* Camada 1: drain externo (roxo que encolhe convergindo na logo) */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <motion.circle
          cx="50" cy="50"
          fill={VELVET}
          filter="url(#splash-drain)"
          initial={{ r: 90 }}
          animate={{ r: drained ? 0 : 90 }}
          transition={{ duration: T_ABSORB / 1000, ease: [0.6, 0, 0.35, 1] }}
        />
      </svg>

      {/* Camada 2: logo (branca em cima, líquido roxo por dentro) */}
      <motion.div
        className="relative flex items-center gap-3"
        animate={{ scale: exiting ? 0.94 : 1 }}
        transition={{ duration: T_EXIT / 1000, ease: 'easeOut' }}
      >
        {/* Logo branca — fade out durante absorção */}
        <motion.svg
          viewBox={VIEWBOX}
          width={220}
          height={103}
          initial={{ scale: 0.78, opacity: 0 }}
          animate={{ scale: 1, opacity: drained ? 0 : 1 }}
          transition={{
            scale:   { duration: T_ENTER / 1000, ease: [0.34, 1.4, 0.5, 1] },
            opacity: { duration: 0.6, delay: drained ? T_ABSORB / 1000 * 0.45 : 0 },
          }}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <path fill="#ffffff" d={PATH_1} />
          <path fill="#ffffff" d={PATH_2} />
        </motion.svg>

        {/* Logo "líquida": rect roxo clipado pela forma da logo, com filtro de líquido */}
        <motion.svg
          viewBox={VIEWBOX}
          width={220}
          height={103}
          initial={{ opacity: 0 }}
          animate={{ opacity: drained ? 1 : 0 }}
          transition={{ duration: 0.6, delay: drained ? T_ABSORB / 1000 * 0.4 : 0 }}
        >
          <g clipPath="url(#velvet-clip)">
            <rect
              x="100" y="20"
              width="430" height="240"
              fill={VELVET}
              filter="url(#splash-inside)"
            />
          </g>
        </motion.svg>

        <AnimatePresence>
          {showText && (
            <motion.span
              key="velvet-text"
              style={{
                fontFamily: "'GFS Didot', 'Didot', 'Bodoni 72', 'Times New Roman', serif",
                fontWeight: 400,
                fontSize: 84,
                color: VELVET,
                lineHeight: 1,
                letterSpacing: '-0.01em',
              }}
              initial={{ opacity: 0, x: -16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              Velvet
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'absorbing' && (
            <>
              {SPARKLES.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: 4,
                    height: 4,
                    background: '#ffffff',
                    left: '50%',
                    top: '50%',
                    pointerEvents: 'none',
                  }}
                  initial={{ x: s.x, y: s.y, opacity: 0, scale: 0 }}
                  animate={{ x: 0, y: 0, opacity: [0, 1, 0], scale: [0, 1, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, delay: s.delay, ease: 'easeIn' }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
