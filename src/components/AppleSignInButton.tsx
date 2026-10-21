import * as AppleAuthentication from 'expo-apple-authentication';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Le bouton natif « Continuer avec Apple ».
 *
 * À part pour que le site n'embarque pas le module Apple : sur le web, ce
 * composant n'existe pas (`AppleSignInButton.web.tsx`).
 */
export function AppleSignInButton({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={999}
      style={style}
      onPress={onPress}
    />
  );
}
