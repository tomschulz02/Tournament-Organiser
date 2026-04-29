import { createContext, useContext } from "react";

export const MessageContext = createContext();

export const useMessage = () => useContext(MessageContext);