'use client';

import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  isPositive?: boolean;
  showFill?: boolean;
}

export default function Sparkline({
  data,
  width = 84,
  height = 24,
  color,
  isPositive,
  showFill = true,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="bg-[#141b26]/40 rounded-[2px]" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Determine stroke color if not explicitly provided
  const determinedPositive = isPositive !== undefined ? isPositive : data[data.length - 1] >= data[0];
  const strokeColor = color || (determinedPositive ? '#3fb950' : '#f85149');
  const fillColor = determinedPositive ? 'rgba(63, 185, 80, 0.12)' : 'rgba(248, 81, 73, 0.12)';

  const paddingY = 2;
  const usableHeight = height - paddingY * 2;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = paddingY + usableHeight - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible select-none inline-block align-middle"
    >
      <defs>
        <linearGradient id={`grad-${strokeColor.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      {showFill && (
        <path d={areaD} fill={`url(#grad-${strokeColor.replace(/[^a-zA-Z0-9]/g, '')})`} />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* End point marker */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2"
        fill={strokeColor}
      />
    </svg>
  );
}
