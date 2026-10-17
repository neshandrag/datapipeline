const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };

export const DashboardIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <rect x="3" y="3" width="6.5" height="6.5" rx="1.5" />
    <rect x="10.5" y="3" width="6.5" height="4" rx="1.5" />
    <rect x="10.5" y="9.5" width="6.5" height="7.5" rx="1.5" />
    <rect x="3" y="11.5" width="6.5" height="5.5" rx="1.5" />
  </svg>
);

export const UploadIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M3.5 14v1.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V14M10 3v9.5M10 3 6.5 6.5M10 3l3.5 3.5" />
  </svg>
);

export const AnalysisIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M4 16.5V9M10 16.5V3.5M16 16.5v-6" />
  </svg>
);

export const PreprocessIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M10 6.5v3.5l2.3 2.3" />
  </svg>
);

export const QualityIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M10 2.5 16 5v4.5c0 4.14-2.7 7.02-6 8.5-3.3-1.48-6-4.36-6-8.5V5z" />
    <path d="M7.3 9.8l1.8 1.8 3.6-3.8" />
  </svg>
);

export const MonitoringIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M2.5 10.5h3l1.8-4.5 3 8 1.7-3.5h3.5" />
  </svg>
);

export const SettingsIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.9 5.1l-1.1 1.1M6.2 13.7l-1.1 1.1M14.9 14.9l-1.1-1.1M6.2 6.2 5.1 5.1" />
  </svg>
);

export const AITrainerIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <circle cx="10" cy="7.5" r="3" />
    <path d="M5 17c0-3.3 2-5 5-5s5 1.7 5 5" />
    <path d="M15.5 4.5l1.5-1.5M15.5 10.5l1.5 1.5M3.5 4.5 2 3M3.5 10.5 2 12" />
  </svg>
);

export const ChevronIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M12.5 5 7.5 10l5 5" />
  </svg>
);

export const CheckIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.8 10.2l2.1 2.1 4.3-4.6" />
  </svg>
);

export const FileIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} {...common}>
    <path d="M5 2.5h6.5L15 6v11a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5z" />
    <path d="M11.5 2.5V6H15" />
  </svg>
);
