import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeProps {
  url: string;
  size?: number;
}

const QRCodeComponent: React.FC<QRCodeProps> = ({ url, size = 200 }) => {
  return (
    <div className="qr-code-container">
      <QRCodeSVG
        value={url}
        size={size}
        level="H"
        includeMargin={true}
      />
    </div>
  );
};

export default QRCodeComponent;

