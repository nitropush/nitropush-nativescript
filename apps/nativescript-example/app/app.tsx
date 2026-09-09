import * as React from 'react';
import { useEffect, useState } from 'react';
import { start } from 'react-nativescript';
import { alert } from '@nativescript/core';
import { configure, sync, InstallMode, SyncStatus, type LocalPackage } from '@nitropush/nativescript';

const client = configure();
// Change this marker, rebuild the JS bundle and upload it to verify an OTA visually.
const demoVersion = 'File delta OTA v1.0.6';
const colors = { background: '#0b1020', card: '#141a30', muted: '#7c8ab0', blue: '#3b82f6', secondary: '#1f2a44' };

function Demo() {
  const [running, setRunning] = useState<LocalPackage | null>(null);
  const [pending, setPending] = useState<LocalPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const readMetadata = async () => {
    const [active, staged] = await Promise.all([client.getCurrentPackage(), client.getPendingPackage()]);
    setRunning(active); setPending(staged);
  };
  useEffect(() => {
    // The React screen must mount before confirming the selected bundle healthy.
    client.notifyAppReady().then(readMetadata).catch(e => setError(String(e)));
  }, []);
  const refresh = async () => {
    setBusy(true); setError(null);
    try {
      await sync(client, { installMode: InstallMode.ON_NEXT_RESTART }, (next, failure) => {
        setStatus(next === SyncStatus.UPDATE_INSTALLED ? 'Update ready for next launch' : next);
        if (failure) setError(failure.message);
      });
      await readMetadata();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const rollbackPending = async () => {
    setBusy(true);
    try {
      await client.clearPendingUpdate();
      await readMetadata(); setError(null);
      setStatus('Pending update removed');
    }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const labelStyle = { color: colors.muted, fontSize: 11, marginTop: 8 };
  const valueStyle = { color: '#ffffff', fontSize: 16, marginTop: 2 };
  const buttonStyle = { color: '#ffffff', backgroundColor: colors.blue, borderRadius: 12, height: 48, marginBottom: 12, fontSize: 16 };
  return <page backgroundColor={colors.background} actionBarHidden={true}>
    <scrollView><stackLayout padding={24}>
      <label text="NitroPush demo" color="#ffffff" fontSize={24} fontWeight="600" />
      <label text={`native-driven · React NativeScript · ${demoVersion}`} textWrap={true} color={colors.muted} marginBottom={24} />
      <image src="~/assets/nitropush-logo.png" width={112} height={112} stretch="aspectFit" horizontalAlignment="center" marginBottom={24} />
      <stackLayout backgroundColor={colors.card} padding={16} borderRadius={12} marginBottom={24}>
        <label text="RUNNING" style={labelStyle} />
        <label text={running ? `v${running.label}` : 'binary bundle'} textWrap={true} style={valueStyle} />
        <label text="PENDING" style={labelStyle} />
        <label text={pending ? `v${pending.label}` : '—'} textWrap={true} style={valueStyle} />
        <label text="STATUS" style={labelStyle} />
        <label text={status} textWrap={true} style={valueStyle} />
        {error ? <><label text="ERROR" style={labelStyle} /><label text={error} textWrap={true} color="#ff8a8a" /></> : null}
      </stackLayout>
      <button text={busy ? 'Working…' : 'Refresh'} isEnabled={!busy} onTap={refresh} style={buttonStyle} />
      <button text="Apply pending update" isEnabled={!!pending && !busy} opacity={pending ? 1 : 0.5}
        onTap={() => alert({ title: 'Restart to apply', message: 'Close the app completely from the app switcher, then reopen it to apply the pending update.', okButtonText: 'OK' })}
        style={{ ...buttonStyle, backgroundColor: colors.secondary }} />
      <button text="Rollback pending" isEnabled={!!pending && !busy} opacity={pending ? 1 : 0.5} onTap={rollbackPending}
        style={{ ...buttonStyle, backgroundColor: colors.secondary }} />
      <label text="notifyAppReady runs only after this React screen mounts successfully. NativeScript updates activate on the next cold launch." textWrap={true} color={colors.muted} fontSize={12} marginTop={16} />
    </stackLayout></scrollView>
  </page>;
}
start(React.createElement(Demo));
