import { createElement, type HTMLAttributes } from 'react';

import { cn } from '../utils/cn';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: string;
  height?: string;
};

export function Skeleton({ width = '100%', height = '1rem', className, style, ...props }: SkeletonProps) {
  return createElement('div', {
    'aria-hidden': 'true',
    className: cn('ds-skeleton', className),
    style: { width, height, ...style },
    ...props,
  });
}
