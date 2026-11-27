import React from 'react';

interface TitleEmblemProps {
  compact?: boolean;
}

/**
 * Persian display lockup for UniLudo.
 * with graduation mortarboard, golden tassel, and wooden campus die crest.
 */
export const TitleEmblem: React.FC<TitleEmblemProps> = ({ compact = false }) => {
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        viewBox="0 0 420 148"
        className={compact ? 'w-[270px] sm:w-[320px] h-auto' : 'w-[310px] sm:w-[390px] h-auto'}
        role="img"
        aria-label="منچ صنایع"
      >
        <defs>
          <filter id="emblemDrop" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#07131A" floodOpacity="0.55" />
          </filter>
          <linearGradient id="goldTassel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#DEC6FF" />
            <stop offset="55%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="capTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#264A5E" />
            <stop offset="100%" stopColor="#122836" />
          </linearGradient>
          <linearGradient id="dieFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFDF7" />
            <stop offset="100%" stopColor="#EAE0C8" />
          </linearGradient>
        </defs>

        {/* Subtle ribbon plaque behind emblem */}
        <g filter="url(#emblemDrop)">
          {/* Tilted Graduation Cap on top right */}
          <g transform="translate(274, 12) rotate(10)">
            <polygon
              points="44,4 88,20 44,36 0,20"
              fill="url(#capTop)"
              stroke="#7335E3"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path
              d="M18,26 L18,41 C28,48 60,48 70,41 L70,26"
              fill="#322145"
              stroke="#7335E3"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Tassel */}
            <path
              d="M44,20 L76,28 L79,48"
              fill="none"
              stroke="url(#goldTassel)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="44" cy="20" r="3.5" fill="#DEC6FF" />
            <circle cx="79" cy="50" r="4.5" fill="url(#goldTassel)" />
          </g>

          {/* Tilted Ivory Die on top left */}
          <g transform="translate(52, 22) rotate(-14)">
            <rect
              x="0"
              y="0"
              width="42"
              height="42"
              rx="9"
              fill="url(#dieFace)"
              stroke="#2C1F14"
              strokeWidth="2.6"
            />
            <circle cx="12" cy="12" r="3.5" fill="#D9383A" />
            <circle cx="30" cy="12" r="3.5" fill="#D9383A" />
            <circle cx="12" cy="21" r="3.5" fill="#D9383A" />
            <circle cx="30" cy="21" r="3.5" fill="#D9383A" />
            <circle cx="12" cy="30" r="3.5" fill="#D9383A" />
            <circle cx="30" cy="30" r="3.5" fill="#D9383A" />
          </g>

          {/* Main Persian Display Title with crisp dark stroke */}
          <text
            x="210"
            y="92"
            textAnchor="middle"
            className="font-display"
            fontSize="64"
            fill="#FFFDF5"
            stroke="#09161F"
            strokeWidth="10"
            strokeLinejoin="round"
            style={{ paintOrder: 'stroke fill' }}
          >
            منچ صنایع
          </text>

          {/* Warm gold underline accent with 4 faculty dots */}
          <line
            x1="88"
            y1="115"
            x2="332"
            y2="115"
            stroke="#F5B841"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.9"
          />
          <circle cx="176" cy="130" r="5" fill="#D9383A" stroke="#09161F" strokeWidth="2" />
          <circle cx="198" cy="130" r="5" fill="#2463EB" stroke="#09161F" strokeWidth="2" />
          <circle cx="220" cy="130" r="5" fill="#0D9468" stroke="#09161F" strokeWidth="2" />
          <circle cx="242" cy="130" r="5" fill="#D9820B" stroke="#09161F" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
};
