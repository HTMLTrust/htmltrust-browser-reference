/**
 * Verification status component
 */
import React from 'react';

/**
 * Verification status
 */
export enum VerificationStatus {
  /** The content is verified */
  VERIFIED = 'verified',
  /** The content is not verified */
  NOT_VERIFIED = 'not-verified',
  /** The verification is pending */
  PENDING = 'pending',
  /** The verification failed */
  FAILED = 'failed',
}

/**
 * Verification status component props
 */
export interface VerificationStatusProps {
  /** The verification status */
  status: VerificationStatus;
  /** The verification message */
  message: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Verification status component
 */
export const VerificationStatusIndicator: React.FC<VerificationStatusProps> = ({
  status,
  message,
  className = '',
}) => {
  const baseClass = 'cs-verification-status';
  const statusClass = `${baseClass}--${status}`;
  const classes = [baseClass, statusClass, className].filter(Boolean).join(' ');

  const getStatusIcon = () => {
    switch (status) {
      case VerificationStatus.VERIFIED:
        return '✓';
      case VerificationStatus.NOT_VERIFIED:
        return '✗';
      case VerificationStatus.PENDING:
        return '⋯';
      case VerificationStatus.FAILED:
        return '!';
      default:
        return '?';
    }
  };

  return (
    <div className={classes}>
      <span className={`${baseClass}__icon`}>{getStatusIcon()}</span>
      <span className={`${baseClass}__message`}>{message}</span>
    </div>
  );
};