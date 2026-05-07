import { Composition } from 'remotion';
import { AxingWorkshopScene } from './AxingWorkshopScene';

export function RemotionRoot() {
  return (
    <Composition
      id="AxingWorkshopScene"
      component={AxingWorkshopScene}
      durationInFrames={720}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
