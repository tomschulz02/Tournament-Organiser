import { createContext, useContext } from 'react';

// Separate from ConfirmDialog.jsx so that file exports only components, which
// Fast Refresh needs. The same split as MessageContext / MessageProvider.
export const ConfirmContext = createContext();

export const useConfirm = () => useContext(ConfirmContext);
