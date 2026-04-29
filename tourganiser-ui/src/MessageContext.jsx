import { createContext, useContext } from "react";

const MessageContext = createContext();

export const useMessage = () => useContext(MessageContext);