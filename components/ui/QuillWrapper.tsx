import React from 'react';
import RichTextEditor from './RichTextEditor';

type Props = {
  value: string;
  onChange: (v: string) => void;
};

// Simpler wrapper: always use the in-repo RichTextEditor.
// Avoids referencing external WYSIWYG packages that may not be installed
// and prevents Vite import-analysis from failing when those packages are missing.
const QuillWrapper: React.FC<Props> = ({ value, onChange }) => {
  return <RichTextEditor value={value || ''} onChange={onChange} />;
};

export default QuillWrapper;
