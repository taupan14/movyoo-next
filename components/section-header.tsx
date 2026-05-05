'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  href?: string;
  action?: string;
}

export function SectionHeader({ title, href, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3 px-4 lg:px-6">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
          {action || 'View All'}
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}
