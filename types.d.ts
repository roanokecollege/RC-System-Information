type Statistics = {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
  netUp: number;
  netDown: number;
};

type InfoFilesObject = {
  rcTag: string;
  department: string;
  assignedLocationBuilding: string;
  assignedLocationRoom: string;
  localAccount: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  usageType: string;
  yearModel: string;
};

type StaticData = {
  totalStorage: number;
  cpuModel: string;
  totalMemoryGB: number;

  computerName: string;
  localIp: string;
  publicIp: string;
  wifiMac: string;
  ethernetMac: string;

  infoFiles: InfoFilesObject;

  osType: string;
  osVersion: string;
  osArch: string;

  uptime: number;

  loggedUser: string;

  deviceManufacturer: string;
  deviceModel: string;
  deviceSerial: string; // ✅ ADD THIS
};

type SendToITPayload = {
  data: StaticData;
  stats: Statistics;
  code: string;
};

type SendToITResponse = {
  success: boolean;
  error?: string; // optional but you return it in failure
};

type EventPayloadMapping = {
  statistics: Statistics;
  getStaticData: StaticData;
  sendToIT: SendToITResponse;
};

type UnsubscribeFunction = () => void;

interface Window {
  electron: {
    subscribeStatistics: (
      callback: (statistics: Statistics) => void,
    ) => UnsubscribeFunction;

    getStaticData: () => Promise<StaticData>;

    sendToIT: (payload: SendToITPayload) => Promise<SendToITResponse>;
  };
}
