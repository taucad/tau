import { birdhouseCode } from '@/components/mock-code';
import { createContext, useContext, useReducer, ReactNode } from 'react';

interface ReplicadState {
  code: string;
  parameters: Record<string, any>;
  error: string | undefined;
  isComputing: boolean;
  mesh: { edges: any; faces: any } | undefined;
}

type ReplicadAction =
  | { type: 'SET_CODE'; payload: string }
  | { type: 'SET_PARAMETERS'; payload: Record<string, any> }
  | { type: 'UPDATE_PARAMETER'; payload: { key: string; value: any } }
  | { type: 'SET_ERROR'; payload: string | undefined }
  | { type: 'SET_COMPUTING'; payload: boolean }
  | { type: 'SET_MESH'; payload: { edges: any; faces: any } | undefined };

const initialState: ReplicadState = {
  code: birdhouseCode,
  parameters: {},
  error: undefined,
  isComputing: false,
  mesh: undefined,
};

function replicadReducer(state: ReplicadState, action: ReplicadAction): ReplicadState {
  switch (action.type) {
    case 'SET_CODE': {
      return {
        ...state,
        code: action.payload,
      };
    }
    case 'SET_PARAMETERS': {
      console.log('setting parameters');
      return {
        ...state,
        parameters: action.payload,
      };
    }
    case 'UPDATE_PARAMETER': {
      console.log('updating parameter');
      return {
        ...state,
        parameters: {
          ...state.parameters,
          [action.payload.key]: action.payload.value,
        },
      };
    }
    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
      };
    }
    case 'SET_COMPUTING': {
      return {
        ...state,
        isComputing: action.payload,
      };
    }
    case 'SET_MESH': {
      return {
        ...state,
        mesh: action.payload,
      };
    }
    default: {
      return state;
    }
  }
}

const ReplicadContext = createContext<
  | {
      state: ReplicadState;
      dispatch: React.Dispatch<ReplicadAction>;
    }
  | undefined
>(undefined);

export function ReplicadProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(replicadReducer, initialState);

  return <ReplicadContext.Provider value={{ state, dispatch }}>{children}</ReplicadContext.Provider>;
}

export function useReplicad() {
  const context = useContext(ReplicadContext);
  if (!context) {
    throw new Error('useReplicad must be used within a ReplicadProvider');
  }
  return context;
}
