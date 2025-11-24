import Swal from 'sweetalert2';

export const confirm = async (opts: { title?: string; text?: string; confirmButtonText?: string; cancelButtonText?: string }) => {
  const r = await Swal.fire({
    title: opts.title || 'Are you sure?',
    text: opts.text || '',
    icon: 'warning',
    showCancelButton: true,
    cancelButtonText: opts.cancelButtonText || 'Cancel',
    confirmButtonText: opts.confirmButtonText || 'Yes, do it',
    reverseButtons: true
  });
  return !!r.isConfirmed;
};

export const success = (title: string, text?: string) => Swal.fire({ icon: 'success', title: title || 'Success', text: text || '', timer: 2500, showConfirmButton: false });
export const error = (title: string, text?: string) => Swal.fire({ icon: 'error', title: title || 'Error', text: text || '' });
export const info = (title: string, text?: string) => Swal.fire({ icon: 'info', title: title || 'Info', text: text || '' });

export const toast = (title: string, icon: 'success' | 'error' | 'info' = 'success') => {
  Swal.fire({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2000,
    icon,
    title
  });
};
