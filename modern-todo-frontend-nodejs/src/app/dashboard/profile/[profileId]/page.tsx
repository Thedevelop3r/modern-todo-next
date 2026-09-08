"use client";
import React, { useEffect, useState } from "react";
import { getProfile, updateUserProfile, capitalizeEachWord } from "@/utils";
import { useStore } from "@/store/state";

export default function Profile({ params }: { params: { profileId: string } }) {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState({ name: false, status: false });
  const { updateUser } = useStore();
  const profileId = params?.profileId;

  const handleUserNameChange = async () => {
    setLoading(true);
    if (profile?.name && (profile?.name?.length < 4 || profile?.name?.length > 25)) {
      setLoading(false);
      return;
    }
    updateUserProfile(profile)
      .then((response) => response.json())
      .then((data: User) => {
        setProfile(data);
        updateUser({ user: data, isLoggedIn: true });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setEdit({ ...edit, name: false });
        setLoading(false);
      });
  };
  const handleUserSatusChange = async () => {
    setLoading(true);
    if (profile?.status && (profile?.status?.length < 4 || profile?.status?.length > 25)) {
      setLoading(false);
      return;
    }
    updateUserProfile(profile)
      .then((response) => response.json())
      .then((data: User) => {
        setProfile(data);
        updateUser({ user: data, isLoggedIn: true });
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setEdit({ ...edit, status: false });
        setLoading(false);
      });
  };

  const handleGetProfile = async () => {
    setLoading(true);
    getProfile()
      .then((response) => {
        console.log("getting profile");
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (profileId) {
      handleGetProfile();
    }
  }, [profileId]);

  return (
    <div className="flex flex-col flex-nowrap w-full h-full">
      <div className="flex flex-col flex-nowrap w-full h-full">
        <div className="flex flex-row flex-nowrap justify-between items-center w-full h-12 px-2 mb-10 border-b-2 py-2">
          <h1 className="text-2xl font-bold">Profile</h1>
        </div>
        {/* Name */}
        <div className="flex flex-col flex-nowrap w-full h-full px-2 mt-2">
          <div className="border-b-2 pb-2">
            <h1 className="text-2xl font-bold mb-2">Name</h1>
            <div className="flex flex-row items-center justify-between">
              {edit.name === false && (
                <>
                  <p className="text-lg font-medium h-full">{profile?.name}</p>
                  <button
                    onClick={() => {
                      setEdit({ ...edit, name: true });
                    }}
                    className="bg-gray-200 text-gray-600 px-2 h-full"
                  >
                    edit
                  </button>
                </>
              )}
              {edit.name === true && (
                <>
                  <input
                    className="text-lg font-medium h-full border-2"
                    value={profile?.name}
                    onChange={(e) => {
                      setProfile({ ...profile, name: capitalizeEachWord(e.target.value) });
                    }}
                    minLength={4}
                    maxLength={25}
                  />
                  <button onClick={handleUserNameChange} className="bg-gray-200 text-gray-600 px-2 h-full">
                    update
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Email */}
        <div className="flex flex-col flex-nowrap w-full h-full px-2 mt-2">
          <div className="border-b-2 pb-2">
            <h1 className="text-2xl font-bold mb-2">Email</h1>
            <div className="flex flex-row items-center justify-between">
              <p className="text-lg font-medium h-full">{profile?.email}</p>
            </div>
          </div>
        </div>
        {/* status */}
        <div className="flex flex-col flex-nowrap w-full h-full px-2 mt-2">
          <div className="border-b-2 pb-2">
            <h1 className="text-2xl font-bold mb-2">Status</h1>
            <div className="flex flex-row items-center justify-between">
              {edit.status === false && (
                <>
                  <p className={`text-lg font-medium h-full px-2 rounded-md ${profile?.status === "active" ? "bg-green-100 text-green-900" : "bg-gray-200 text-gray-600"}`}>
                    {profile !== undefined && profile?.status && profile?.status?.charAt(0)?.toUpperCase() + profile?.status?.slice(1)}
                  </p>
                  <button
                    onClick={() => {
                      setEdit({ ...edit, status: true });
                    }}
                    className="bg-gray-200 text-gray-600 px-2 h-full"
                  >
                    edit
                  </button>
                </>
              )}

              {edit.status === true && (
                <>
                  <select
                    className={`text-lg font-medium h-full px-2 rounded-md ${profile?.status === "active" ? "bg-green-100 text-green-900" : "bg-gray-200 text-gray-600"}`}
                    value={profile?.status}
                    onChange={(e) => {
                      setProfile({ ...profile, status: e.target.value });
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button onClick={handleUserSatusChange} className="bg-gray-200 text-gray-600 px-2 h-full">
                    update
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
