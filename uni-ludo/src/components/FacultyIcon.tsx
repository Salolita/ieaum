import React from 'react';
import { TeamId } from '../../../portal/uniludo/constants';

export const TeamSymbol: React.FC<{ teamId: TeamId; className?: string }> = ({
  teamId,
  className = 'w-4 h-4',
}) => {
  switch (teamId) {
    case 'optimization':
      // Drafting compass / gear silhouette
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
          <path d="M10.5 8.5L6 20M13.5 8.5L18 20M7.5 15h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'projects':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M4 4v16h16M8 7h6m-3 5h8m-5 5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'analytics':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M4 20h16M7 17v-4m5 4V8m5 9V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'production':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <path d="M4 20V9l6 3V9l6 3V5h4v15H4Zm4-4h1m4 0h1" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
  }
};

export const LibraryShieldIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <path
      d="M12 3L4.5 6.5V12C4.5 16.6 7.7 20.4 12 21.5C16.3 20.4 19.5 16.6 19.5 12V6.5L12 3Z"
      fill="#1E3A5F"
      stroke="#130F1B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 10.2C9.7 9.6 11 9.8 12 10.6C13 9.8 14.3 9.6 15.5 10.2V15.5C14.3 14.9 13 15.1 12 15.9C11 15.1 9.7 14.9 8.5 15.5V10.2Z"
      fill="#DEC6FF"
    />
  </svg>
);

export const CampusEventIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" fill="#F59E0B" stroke="#78350F" strokeWidth="1.8" />
    <path
      d="M8.2 10.5H15.2V14.2C15.2 15.9 13.8 17.2 12.1 17.2H11.3C9.6 17.2 8.2 15.9 8.2 14.2V10.5Z"
      fill="#FFFDF5"
      stroke="#78350F"
      strokeWidth="1.5"
    />
    <path d="M15.2 11.4H16.6C17.4 11.4 18 12 18 12.8C18 13.6 17.4 14.2 16.6 14.2H15.2" stroke="#78350F" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10.2 7.8V6.2M13.2 7.8V6.2" stroke="#78350F" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const GraduationCapIcon: React.FC<{ className?: string; filled?: boolean }> = ({
  className = 'w-4 h-4',
  filled = true,
}) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
    <polygon
      points="12,4 22,9 12,14 2,9"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
    <path
      d="M6 11.5V16.2C8 18.2 16 18.2 18 16.2V11.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M21 10V15.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
